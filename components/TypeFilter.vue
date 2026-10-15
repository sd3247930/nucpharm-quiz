<template>
	<view class="type-filter" role="group" aria-label="题型筛选"><button v-for="item in items" :key="item.value"
			class="type-chip" :class="{selected:modelValue === item.value}"
			:aria-pressed="modelValue === item.value"
			@tap="$emit('update:modelValue',item.value)"><text>{{item.label}}</text><text
				class="chip-count">{{item.count}}</text></button></view>
</template>
<script>
export default {
	props: {
		modelValue: {
			type: String,
			default: 'all'
		},
		items: {
			type: Array,
			default: () => []
		}
	},
	emits: ['update:modelValue']
}
</script>
<style scoped>
.type-filter {
	display: flex;
	gap: 6px;
	margin: 12px 0 16px
}

.type-chip {
	flex: 1;
	min-width: 0;
	min-height: 46px;
	border: 1px solid transparent;
	border-radius: 24px;
	padding: 6px 3px;
	margin: 0;
	background: var(--np-surface-2);
	color: var(--np-text-2);
	display: flex;
	align-items: center;
	justify-content: center;
	flex-wrap: wrap;
	gap: 2px 5px;
	font-size: 12px;
	line-height: 1.4
}

.selected {
	background: var(--np-primary-soft);
	color: var(--np-primary);
	border-color: var(--np-primary);
	font-weight: 600
}

.chip-count {
	font-variant-numeric: tabular-nums;
	font-size: 11px
}
</style>
