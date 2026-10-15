<template>
	<view class="progress-track" :class="tone" role="progressbar" :aria-valuenow="percent" aria-valuemin="0"
		aria-valuemax="100">
		<view class="progress-fill" :style="{width:percent + '%'}" />
	</view>
</template>
<script>
export default {
	props: {
		value: {
			type: Number,
			default: 0
		},
		tone: {
			type: String,
			default: ''
		}
	},
	computed: {
		percent() {
			return Number.isFinite(this.value) ? Math.min(100, Math.max(0, this.value)) : 0
		}
	}
}
</script>
<style scoped>
.progress-track {
	height: 6px;
	background: var(--np-surface-2);
	border-radius: 8px;
	overflow: hidden
}

.progress-fill {
	height: 100%;
	border-radius: inherit;
	background: var(--np-primary)
}

.accent .progress-fill {
	background: var(--np-accent)
}

.caution .progress-fill {
	background: var(--np-caution)
}

.inverse {
	background: rgba(255, 255, 255, .18)
}

.inverse .progress-fill {
	background: #7fe3c4
}
</style>
