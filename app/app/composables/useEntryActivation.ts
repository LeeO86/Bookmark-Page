/** Keep native link activation while making Shift a text-selection modifier. */
export function useEntryActivation() {
  const selectingText = ref(false)

  function syncModifiers(event: MouseEvent | KeyboardEvent) {
    selectingText.value = event.shiftKey
  }

  function resetModifiers() {
    selectingText.value = false
  }

  onMounted(() => {
    window.addEventListener('keydown', syncModifiers)
    window.addEventListener('keyup', syncModifiers)
    window.addEventListener('blur', resetModifiers)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', syncModifiers)
    window.removeEventListener('keyup', syncModifiers)
    window.removeEventListener('blur', resetModifiers)
  })

  function primaryClick(event: MouseEvent) {
    if (event.shiftKey) {
      event.preventDefault()
      return
    }
    if (event.altKey && event.button === 0) {
      event.preventDefault()
      const link = event.currentTarget as HTMLAnchorElement
      // Window features request a separate window; the browser retains the final choice.
      window.open(link.href, '_blank', 'popup=yes,width=1200,height=800,noopener,noreferrer')
    }
  }

  function contextMenu(event: MouseEvent, openMenu: () => void) {
    if (event.shiftKey) return
    event.preventDefault()
    openMenu()
  }

  return { selectingText, syncModifiers, primaryClick, contextMenu }
}
