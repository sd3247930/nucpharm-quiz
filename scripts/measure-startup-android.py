"""Measure complete NucPharm home rendering through ADB; never clear app data.

Example: python scripts/measure-startup-android.py --package <package> --output private/startup/result.json
The screenshot classification requires both the light page canvas AND the styled green hero.
"""
import argparse
import io
import json
from pathlib import Path
import statistics
import subprocess
import time
from PIL import Image

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--adb',default='adb')
parser.add_argument('--port',default='5037')
parser.add_argument('--package',required=True)
parser.add_argument('--output',required=True)
parser.add_argument('--runs',type=int,default=3)
parser.add_argument('--offline',action='store_true')
parser.add_argument('--warm',action='store_true')
args=parser.parse_args()
output=Path(args.output).resolve();output.parent.mkdir(parents=True,exist_ok=True)
def adb(*commands):
 result=subprocess.run([args.adb,'-P',args.port,*commands],capture_output=True)
 if result.returncode:raise RuntimeError(result.stderr.decode(errors='replace'))
 return result.stdout
def network():
 return {name:adb('shell','settings','get','global',key).decode().strip() for name,key in [('airplane','airplane_mode_on'),('wifi','wifi_on'),('data','mobile_data')]}
def restored_network(original):
 adb('shell','cmd','connectivity','airplane-mode','enable' if original['airplane']=='1' else 'disable')
 adb('shell','svc','wifi','enable' if original['wifi']=='1' else 'disable')
 adb('shell','svc','data','enable' if original['data']=='1' else 'disable')
 for _ in range(12):
  current=network()
  if current==original:return current
  time.sleep(.3)
 raise RuntimeError('Original network state not yet restored')
def styled_home(frame):
 image=Image.open(io.BytesIO(frame)).convert('RGB');w,h=image.size
 canvas=[image.getpixel((max(5,w//100),round(h*y))) for y in (.3,.4,.5,.6,.7)]
 hero=[image.getpixel((round(w*x),round(h*y))) for x in (.15,.4,.7,.85) for y in (.22,.27,.32)]
 green=lambda p:p[0]<100 and p[1]>45 and p[1]>p[0]*1.2 and p[2]>30
 return sum(min(p)>200 for p in canvas)>=4 and sum(green(p) for p in hero)>=6

original_network=network()
rows=[]
report={'status':'RUNNING','mode':'warm' if args.warm else 'process-cold','offline':args.offline,
 'method':'am start -W, wait 200ms after native Activity draw, sample light canvas AND styled green hero; no concurrent browser tests',
 'appDataCleared':False,'samples':rows,'networkBefore':original_network}
try:
 if args.offline:
  adb('shell','cmd','connectivity','airplane-mode','enable');adb('shell','svc','wifi','disable');adb('shell','svc','data','disable');time.sleep(.6)
  report['networkDuring']=network()
  assert report['networkDuring']=={'airplane':'1','wifi':'0','data':'0'}
 for run in range(args.runs):
  # Move away from the previous home surface to exclude a stale screenshot on fast launches.
  adb('shell','input','keyevent','KEYCODE_HOME');time.sleep(.25)
  if not args.warm:adb('shell','am','force-stop',args.package)
  time.sleep(.2)
  started=time.perf_counter()
  activity=adb('shell','am','start','-W','-n',args.package+'/io.dcloud.PandoraEntry').decode(errors='replace')
  if 'Status: ok' not in activity:raise RuntimeError('Activity did not start')
  time.sleep(.2)
  samples=[]
  while time.perf_counter()-started<25:
   t=time.perf_counter()-started
   frame=adb('exec-out','screencap','-p')
   valid=styled_home(frame)
   samples.append({'captureStartMs':round(t*1000),'captureEndMs':round((time.perf_counter()-started)*1000),'completeHome':valid})
   if valid:
    (output.parent/(output.stem+f'-run{run+1}.png')).write_bytes(frame)
    row={'run':run+1,'homeVisibleByMs':samples[-1]['captureEndMs'],
     'previousNotReadyByMs':samples[-2]['captureEndMs'] if len(samples)>1 else None,'activityTotalMs':None,'frames':samples}
    for line in activity.splitlines():
     if line.strip().startswith('TotalTime:'):row['activityTotalMs']=int(line.split(':',1)[1].strip())
    rows.append(row)
    print(f'PASS {report["mode"]} offline={args.offline} run={run+1} complete styled home by {row["homeVisibleByMs"]}ms',flush=True)
    break
   time.sleep(.1)
  else:raise RuntimeError('Complete styled home did not appear within 25 seconds')
  time.sleep(.5)
 report.update(status='PASS',medianHomeVisibleByMs=statistics.median(row['homeVisibleByMs'] for row in rows),
  minHomeVisibleByMs=min(row['homeVisibleByMs'] for row in rows),maxHomeVisibleByMs=max(row['homeVisibleByMs'] for row in rows))
finally:
 report['networkAfter']=restored_network(original_network) if args.offline else network()
 output.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
