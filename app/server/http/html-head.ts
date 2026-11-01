/** Find a closing head tag across chunks, ignoring comments, attributes and raw text. */
export class HtmlHeadScanner {
  private mode: 'text' | 'tag' | 'comment' = 'text'
  private token = ''
  private quote = ''
  private rawText = ''
  private commentTail = ''

  /** Return the end offset within this chunk, or null if the head is still open. */
  push(chunk: Buffer): number | null {
    for (let index = 0; index < chunk.length; index++) {
      const char = String.fromCharCode(chunk[index]!)
      if (this.mode === 'comment') {
        this.commentTail = (this.commentTail + char).slice(-3)
        if (this.commentTail === '-->') this.mode = 'text'
        continue
      }
      if (this.mode === 'text') {
        if (char === '<') {
          this.mode = 'tag'
          this.token = '<'
          this.quote = ''
        }
        continue
      }
      this.token += char
      if (this.rawText) {
        const prefix = '</' + this.rawText
        if (
          (this.token.length <= prefix.length && !prefix.startsWith(this.token.toLowerCase())) ||
          (this.token.length === prefix.length + 1 && !/[\s/>]/.test(char))
        ) {
          this.mode = char === '<' ? 'tag' : 'text'
          this.token = char === '<' ? '<' : ''
          continue
        }
      } else if (this.token === '<!--') {
        this.mode = 'comment'
        this.commentTail = ''
        this.token = ''
        continue
      }
      if (this.quote) {
        if (char === this.quote) this.quote = ''
        continue
      }
      if (char === '"' || char === "'") {
        this.quote = char
        continue
      }
      if (char !== '>') continue
      const tag = /^<(\/?)([a-z][\w:-]*)(?:\s|\/?>)/i.exec(this.token)
      const name = tag?.[2]?.toLowerCase()
      const closing = tag?.[1] === '/'
      if (this.rawText) {
        if (closing && name === this.rawText) this.rawText = ''
      } else if (closing && name === 'head') {
        return index + 1
      } else if (!closing && name && /^(script|style|title|textarea)$/.test(name)) {
        this.rawText = name
      }
      this.mode = 'text'
      this.token = ''
    }
    return null
  }
}
