export function useEntryMenu() {
  const menuId = ref<string | null>(null)
  let timer: number | undefined
  let suppressClick = false

  function open(id: string) {
    menuId.value = id
  }

  function onOpen(id: string, value: boolean) {
    if (value) {
      menuId.value = id
      return
    }
    if (menuId.value === id) {
      menuId.value = null
    }
  }

  function pressStart(id: string, event: PointerEvent) {
    if (event.pointerType === 'mouse') {
      return
    }
    window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      suppressClick = true
      menuId.value = id
    }, 500)
  }

  function pressEnd() {
    window.clearTimeout(timer)
  }

  function pressClick(event: MouseEvent) {
    if (!suppressClick) {
      return
    }
    suppressClick = false
    event.preventDefault()
    event.stopPropagation()
  }

  return { menuId, open, onOpen, pressStart, pressEnd, pressClick }
}
