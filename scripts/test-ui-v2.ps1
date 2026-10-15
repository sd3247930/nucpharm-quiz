$ErrorActionPreference = 'Stop'
$env:PYTHONIOENCODING = 'utf-8'
# UI回归只校验题库，不重新导入/改写专业数据。
python scripts/audit-question-bank.py
if ($LASTEXITCODE) { exit $LASTEXITCODE }
python scripts/verify-assets.py
if ($LASTEXITCODE) { exit $LASTEXITCODE }
node --import ./tests/support/register.mjs --test 'tests/unit/*.test.mjs' 'tests/integration/*.test.mjs'
if ($LASTEXITCODE) { exit $LASTEXITCODE }
node --test 'tests/e2e/*.test.mjs'
if ($LASTEXITCODE) { exit $LASTEXITCODE }
node scripts/capture-ui-v2.mjs
if ($LASTEXITCODE) { exit $LASTEXITCODE }
python scripts/security-audit.py
exit $LASTEXITCODE
