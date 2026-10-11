import { DOMParser, XMLSerializer, type Element, type Node } from '@xmldom/xmldom'

const allowedElements = new Set([
  'svg',
  'g',
  'path',
  'circle',
  'rect',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'title',
  'desc',
  'defs',
  'lineargradient',
  'radialgradient',
  'stop',
  'clippath',
  'mask',
  'symbol',
  'use',
  'text',
  'tspan',
])

const allowedAttributes = new Set([
  'id',
  'class',
  'xmlns',
  'xmlns:xlink',
  'viewbox',
  'width',
  'height',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'd',
  'points',
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-dasharray',
  'stroke-dashoffset',
  'fill-opacity',
  'stroke-opacity',
  'opacity',
  'transform',
  'fill-rule',
  'clip-rule',
  'clip-path',
  'mask',
  'offset',
  'stop-color',
  'stop-opacity',
  'gradientunits',
  'gradienttransform',
  'fx',
  'fy',
  'spreadmethod',
  'font-size',
  'font-family',
  'text-anchor',
  'dx',
  'dy',
  'role',
  'aria-hidden',
  'aria-label',
])

export function sanitizeSvg(source: string): string {
  if (/<!doctype|<!entity/i.test(source)) {
    throw new Error('SVG type declarations are not allowed')
  }
  const document = new DOMParser({
    onError: (level, message) => {
      if (level === 'fatalError') {
        throw new Error(message)
      }
    },
  }).parseFromString(source, 'image/svg+xml')
  const root = document.documentElement
  if (!root || root.nodeName.toLowerCase() !== 'svg') {
    throw new Error('SVG root element is missing')
  }
  stripAttributes(root)
  prune(root)
  root.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  const xml = new XMLSerializer().serializeToString(root)
  if (/<script|javascript:|data:/i.test(xml)) {
    throw new Error('SVG still contains active content')
  }
  return xml
}

function prune(node: Node): void {
  const children: Node[] = []
  for (let index = 0; index < node.childNodes.length; index += 1) {
    const child = node.childNodes[index]
    if (child) {
      children.push(child)
    }
  }
  for (const child of children) {
    if (child.nodeType === 1) {
      const element = child as Element
      const name = element.nodeName.toLowerCase()
      if (!allowedElements.has(name)) {
        node.removeChild(child)
        continue
      }
      stripAttributes(element)
      prune(child)
    } else if (child.nodeType !== 3 && child.nodeType !== 4) {
      node.removeChild(child)
    }
  }
}

function stripAttributes(element: Element): void {
  const names: string[] = []
  for (let index = 0; index < element.attributes.length; index += 1) {
    const attribute = element.attributes.item(index)
    if (attribute) {
      names.push(attribute.name)
    }
  }
  for (const attributeName of names) {
    const value = element.getAttribute(attributeName) ?? ''
    const attr = attributeName.toLowerCase()
    if (attr.startsWith('on') || !attributeAllowed(attr, value)) {
      element.removeAttribute(attributeName)
    }
  }
}

function attributeAllowed(name: string, value: string): boolean {
  if (name === 'href' || name === 'xlink:href') {
    return value.startsWith('#') && !value.toLowerCase().includes('javascript')
  }
  if (!allowedAttributes.has(name)) {
    return false
  }
  const lower = value.toLowerCase().replace(/\s/g, '')
  return !lower.includes('url(') && !lower.includes('javascript:') && !lower.includes('data:')
}
