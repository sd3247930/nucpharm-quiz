<template>
	<view class="empty-state np-card-flat">
		<view class="empty-symbol"><text>✓</text></view><text class="empty-title">{{title}}</text><text
			class="empty-description">{{description}}</text><button v-if="action"
			class="np-btn np-btn-ghost empty-action" @tap="$emit('action')">{{action}}</button>
	</view>
</template>
<script>
export default {
	props: {
		title: String,
		description: String,
		action: String
	},
	emits: ['action']
}
</script>
<style scoped>
.empty-state {
	padding: 32px 20px;
	display: flex;
	flex-direction: column;
	align-items: center;
	text-align: center
}

.empty-symbol {
	width: 44px;
	height: 44px;
	border-radius: 50%;
	background: var(--np-primary-soft);
	color: var(--np-primary);
	display: flex;
	align-items: center;
	justify-content: center;
	margin-bottom: 16px;
	font-size: 22px
}

.empty-title {
	font-size: 17px;
	font-weight: 600;
	color: var(--np-text)
}

.empty-description {
	font-size: 13px;
	color: var(--np-text-2);
	margin-top: 10px;
	line-height: 1.7;
	max-width: 360px
}

.empty-action {
	margin: 20px 0 0;
	min-width: 140px
}
</style>
