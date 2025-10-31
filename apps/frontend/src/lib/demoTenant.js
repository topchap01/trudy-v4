export function getDemoClient() {
  const url = new URL(window.location.href)
  const fromUrl = url.searchParams.get('client')
  if (fromUrl) {
    sessionStorage.setItem('demoClient', fromUrl)
    return fromUrl
  }
  return sessionStorage.getItem('demoClient') || ''
}
