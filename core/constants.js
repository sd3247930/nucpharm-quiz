/**
 * 核药通 NucPharm · 全局常量
 *
 * 题目类型、考试配额、存储键等「口径」集中在这里，避免多处硬编码。
 */

/** 题目类型 → 展示名 */
export const TYPE_LABEL = {
	single: '单选题',
	multiple: '多选题',
	boolean: '判断题'
}

/** 题目类型 → 短标签（答题卡/徽标用，文字通道） */
export const TYPE_SHORT = {
	single: '单',
	multiple: '多',
	boolean: '判'
}

/** 固定展示顺序 */
export const TYPE_ORDER = ['single', 'multiple', 'boolean']

/** 模拟考试配额（已拍板：40×1 + 10×2 + 20×2 = 70 题 / 100 分） */
export const EXAM_QUOTA = {
	single: {
		count: 40,
		points: 1
	},
	multiple: {
		count: 10,
		points: 2
	},
	boolean: {
		count: 20,
		points: 2
	}
}

export const EXAM_TOTAL_QUESTIONS = 70
export const EXAM_TOTAL_POINTS = 100
export const DEFAULT_EXAM_MINUTES = 60
export const PRACTICE_DEFAULT_COUNT = 20

/** 练习模式 */
export const PRACTICE_MODE = {
	sequence: 'sequence',
	random: 'random',
	mistakes: 'mistakes',
	favorites: 'favorites'
}

export const PRACTICE_MODE_LABEL = {
	sequence: '顺序练习',
	random: '随机练习',
	mistakes: '错题练习',
	favorites: '收藏练习'
}

/** 本地存储键（统一前缀，版本升级时可整体迁移） */
export const STORAGE_PREFIX = 'nucpharm:v1:'
export const STORAGE_KEY = {
	settings: 'settings',
	answers: 'answers',
	mistakes: 'mistakes',
	favorites: 'favorites',
	notes: 'notes',
	exams: 'exams',
	activeExam: 'active-exam',
	examSnapshots: 'exam-snapshots',
	lastPractice: 'last-practice',
	practiceSessions: 'practice-sessions',
	bankVersion: 'bank-version'
}

/** 进度备份文件格式版本 */
export const BACKUP_SCHEMA = 1
export const BACKUP_APP_TAG = 'nucpharm-progress'

/** 考试历史最多保留条数（避免本地存储无限增长） */
export const MAX_EXAM_HISTORY = 30

/** 保留完整试卷快照（含逐题判分与解析）的场次上限，用于成绩页复盘 */
export const MAX_EXAM_SNAPSHOTS = 3

/** H5 localStorage 容量预警阈值（4MB） */
export const H5_STORAGE_WARN_BYTES = 4 * 1024 * 1024

/** 解析文本长度上限（超过则视为异常文件，避免解析卡死） */
export const MAX_IMPORT_CHARS = 8 * 1024 * 1024
