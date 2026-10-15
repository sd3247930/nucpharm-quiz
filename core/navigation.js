export const TAB_ROUTES = ['/pages/home/index', '/pages/study/index', '/pages/exam/index',
	'/pages/mistakes/index', '/pages/settings/index'
]
export function openRoute(url) {
	const path = url.split('?')[0]
	if (TAB_ROUTES.includes(path) || path === '/pages/me/index') uni.switchTab({
		url: path === '/pages/me/index' ? '/pages/settings/index' : path
	})
	else uni.navigateTo({
		url
	})
}
