<template>
	<view class="segmented" role="group" :aria-label="label"><button v-for="item in options" :key="item.value"
			class="segment" :class="{active:modelValue === item.value}" :disabled="item.disabled"
			:aria-pressed="modelValue === item.value"
			@tap="$emit('update:modelValue',item.value)">{{item.label}}</button></view>
</template>
<script>
export default {
	props: {
		modelValue: [String, Number],
		options: {
			type: Array,
			default: () => []
		},
		label: String
	},
	emits: ['update:modelValue']
}
</script>
<style scoped>
.segmented {
	display: flex;
	padding: 4px;
	border-radius: 10px;
	background: var(--np-surface-2);
	gap: 3px;
	min-width: 0
}

.segment {
	flex: 1;
	min-width: 0;
	min-height: 44px;
	margin: 0;
	padding: 5px 7px;
	font-size: 13px;
	line-height: 1.4;
	border: 0;
	background: transparent;
	color: var(--np-text-2);
	border-radius: 7px;
	display: flex;
	align-items: center;
	justify-content: center
}

.active {
	color: var(--np-primary);
	font-weight: 600;
	background: var(--np-surface);
	box-shadow: 0 1px 5px rgba(16, 43, 54, .07)
}

.segment[disabled] {
	opacity: .4
}
</style>
