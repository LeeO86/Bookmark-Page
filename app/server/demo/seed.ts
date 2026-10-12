import { eq } from 'drizzle-orm'
import type { Actor } from '../auth/permissions'
import { writeStatus } from '../checks/run'
import { getDatabase } from '../db/client'
import { fieldDefinitions, settings, tagNamespaces, users } from '../db/schema'
import { now } from '../db/ids'
import { createEntry, deleteEntry } from '../services/entries'
import {
  createFieldDefinition,
  createFilter,
  createNamespace,
  deleteFilter,
} from '../services/catalog'
import { writeSettings } from '../services/settings'

const demoSettingKey = 'demo_seed'

interface DemoRecord {
  entryIds: string[]
  filterIds: string[]
}

type Status = 'up' | 'down' | 'unknown' | 'none'

interface Device {
  name: string
  host: string
  description: string
  type: string
  room: string
  vendor: string
  icon: string
  status: Status
  links: Array<{ label: string; type: 'web' | 'api' | 'ssh'; url: string }>
  note?: string
  password?: string
}

const devices: Device[] = [
  device(
    'Lawo mc²56 — control A main desk',
    '10.1.10.11',
    'Forty-eight fader surface for the main programme. The snapshot “news open” is the one that still has the guest mics live.',
    'audio',
    'control-a',
    'lawo',
    'sliders-horizontal',
    'up',
    [
      ['Desk', 'web', 'https://{{host}}/'],
      ['API', 'api', 'https://{{host}}/api/'],
      ['Service', 'ssh', 'ssh://lawo@{{host}}'],
    ],
    'News open snapshot',
  ),
  device(
    'Genelec 8351 — control A left',
    '10.1.10.21',
    'Left main monitor. GLM group “CR-A mains”. Do not solo this from the machine room.',
    'audio',
    'control-a',
    'genelec',
    'speaker',
    'up',
    [['GLM', 'web', 'https://{{host}}/']],
  ),
  device(
    'Genelec 8351 — control A right',
    '10.1.10.22',
    'Right main monitor, paired with the left cabinet. The trim is stored in the GLM group, not on the desk.',
    'audio',
    'control-a',
    'genelec',
    'speaker',
    'up',
    [['GLM', 'web', 'https://{{host}}/']],
  ),
  device(
    'Clear-Com Eclipse — control A panel',
    '10.1.10.31',
    'Director panel. The beltpack channel is labelled “floor”, even when the floor is studio 2.',
    'intercom',
    'control-a',
    'clearcom',
    'headphones',
    'down',
    [
      ['Panel', 'web', 'https://{{host}}/'],
      ['Service', 'ssh', 'ssh://admin@{{host}}'],
    ],
    undefined,
    'panel-1842',
  ),
  device(
    'Sony HDC-3500 — studio 1 camera A',
    '10.1.20.11',
    'Pedestal camera on the presenter’s left. CCU lives in rack 3, not under the camera.',
    'video',
    'studio-1',
    'sony',
    'video',
    'up',
    [
      ['CCU', 'web', 'https://{{host}}/'],
      ['API', 'api', 'https://{{host}}/api/status'],
    ],
  ),
  device(
    'Sony HDC-3500 — studio 1 camera B',
    '10.1.20.12',
    'Pedestal camera on the presenter’s right. Iris is remote from control A.',
    'video',
    'studio-1',
    'sony',
    'video',
    'unknown',
    [['CCU', 'web', 'https://{{host}}/']],
  ),
  device(
    'Blackmagic ATEM — studio 1 switcher',
    '10.1.20.20',
    'Constellation switcher for studio 1. Program is the tall window; the multiviewer is the wide one.',
    'video',
    'studio-1',
    'blackmagic',
    'clapperboard',
    'up',
    [
      ['Software', 'web', 'https://{{host}}/'],
      ['API', 'api', 'https://{{host}}/control/api/v1'],
    ],
    'Program bus is ME1',
  ),
  device(
    'Prompter — studio 1 left',
    '10.1.20.41',
    'Floor prompter for camera A. The text machine is “prompt-1”, not this glass.',
    'video',
    'studio-1',
    'autoscript',
    'monitor',
    'none',
    [['Preview', 'web', 'https://{{host}}/']],
  ),
  device(
    'Studio 1 lighting desk',
    '10.1.20.51',
    'GrandMA replay for the news look. The house lights are the first executor, not a channel.',
    'lighting',
    'studio-1',
    'ma',
    'lightbulb',
    'up',
    [
      ['Desk', 'web', 'https://{{host}}/'],
      ['Service', 'ssh', 'ssh://ma@{{host}}'],
    ],
  ),
  device(
    'Lawo crystal — control B audio',
    '10.1.11.11',
    'Compact surface for the second programme. It shares the Nova engine with control A.',
    'audio',
    'control-b',
    'lawo',
    'sliders-horizontal',
    'up',
    [
      ['Desk', 'web', 'https://{{host}}/'],
      ['API', 'api', 'https://{{host}}/api/'],
    ],
  ),
  device(
    'Genelec 8331 — control B pair',
    '10.1.11.21',
    'Nearfield pair. The left cabinet answers on this address; the right one follows it.',
    'audio',
    'control-b',
    'genelec',
    'speaker',
    'down',
    [['GLM', 'web', 'https://{{host}}/']],
  ),
  device(
    'Blackmagic ATEM — control B',
    '10.1.11.20',
    'Mini switcher for the side studio. It does not see studio 1 cameras.',
    'video',
    'control-b',
    'blackmagic',
    'clapperboard',
    'unknown',
    [['Software', 'web', 'https://{{host}}/']],
  ),
  device(
    'Clear-Com — control B panel',
    '10.1.11.31',
    'Producer panel. The listen level is loud on purpose.',
    'intercom',
    'control-b',
    'clearcom',
    'headphones',
    'up',
    [['Panel', 'web', 'https://{{host}}/']],
    undefined,
    'panel-2201',
  ),
  device(
    'Ross XPression — graphics 1',
    '10.1.30.11',
    'Primary graphics engine. The preview channel is the one that still says “rehearsal”.',
    'video',
    'machine',
    'ross',
    'tv',
    'up',
    [
      ['Client', 'web', 'https://{{host}}/'],
      ['API', 'api', 'https://{{host}}/api/'],
      ['Service', 'ssh', 'ssh://xp@{{host}}'],
    ],
    'Project: news-2026',
  ),
  device(
    'Ross XPression — graphics 2',
    '10.1.30.12',
    'Backup graphics engine. Take it only when graphics 1 has already failed over.',
    'video',
    'machine',
    'ross',
    'tv',
    'none',
    [
      ['Client', 'web', 'https://{{host}}/'],
      ['Service', 'ssh', 'ssh://xp@{{host}}'],
    ],
  ),
  device(
    'Harmonic playout — channel 1',
    '10.1.30.21',
    'Channel 1 playout. The “next” event is not always the one on the wall clock.',
    'video',
    'machine',
    'harmonic',
    'disc-3',
    'up',
    [
      ['Playlist', 'web', 'https://{{host}}/'],
      ['API', 'api', 'https://{{host}}/api/playlist'],
    ],
  ),
  device(
    'Harmonic playout — channel 2',
    '10.1.30.22',
    'Channel 2 playout, the delayed feed. Do not load the channel 1 playlist here.',
    'video',
    'machine',
    'harmonic',
    'disc-3',
    'down',
    [['Playlist', 'web', 'https://{{host}}/']],
  ),
  device(
    'EditShare — craft storage',
    '10.1.30.31',
    'Shared media storage. The news workspace is the fast one; the archive is the large one.',
    'compute',
    'machine',
    'editshare',
    'hard-drive',
    'up',
    [
      ['Admin', 'web', 'https://{{host}}/'],
      ['API', 'api', 'https://{{host}}/api/'],
      ['Service', 'ssh', 'ssh://root@{{host}}'],
    ],
    'Workspace: news',
  ),
  device(
    'Dell render node 1',
    '10.1.30.41',
    'First render node for the graphics farm. It is loud, and that is normal.',
    'compute',
    'machine',
    'dell',
    'pc-case',
    'up',
    [
      ['iDRAC', 'web', 'https://{{host}}/'],
      ['Service', 'ssh', 'ssh://render@{{host}}'],
    ],
  ),
  device(
    'Dell render node 2',
    '10.1.30.42',
    'Second render node. Leave it in the farm even when a show wants a dedicated box.',
    'compute',
    'machine',
    'dell',
    'pc-case',
    'unknown',
    [['iDRAC', 'web', 'https://{{host}}/']],
  ),
  device(
    'Cisco core — rack 3',
    '10.1.40.1',
    'Core switch for the studio VLANs. The management VRF is the only one with a web page.',
    'network',
    'rack-3',
    'cisco',
    'router',
    'up',
    [
      ['Admin', 'web', 'https://{{host}}/'],
      ['API', 'api', 'https://{{host}}/restconf/'],
      ['Service', 'ssh', 'ssh://netops@{{host}}'],
    ],
    undefined,
    'netops-core',
  ),
  device(
    'Netgear access — studio 1',
    '10.1.40.21',
    'Access switch under the studio 1 riser. The camera VLAN is untagged on ports 1–8.',
    'network',
    'studio-1',
    'netgear',
    'network',
    'up',
    [['Admin', 'web', 'https://{{host}}/']],
  ),
  device(
    'Netgear access — control A',
    '10.1.40.22',
    'Access switch behind the control A desk. The spare port is 24, and it is not spare.',
    'network',
    'control-a',
    'netgear',
    'network',
    'down',
    [['Admin', 'web', 'https://{{host}}/']],
  ),
  device(
    'Wireless — studio floor',
    '10.1.40.30',
    'Floor access point for crew tablets. Guest traffic never lands on the camera VLAN.',
    'network',
    'studio-1',
    'cisco',
    'wifi',
    'up',
    [['Admin', 'web', 'https://{{host}}/']],
    undefined,
    'floor-wifi',
  ),
  device(
    'PTP grandmaster',
    '10.1.40.40',
    'House clock. If this is unknown, believe the cameras before the wall clock.',
    'network',
    'rack-3',
    'meinberg',
    'radio',
    'unknown',
    [
      ['Status', 'web', 'https://{{host}}/'],
      ['Service', 'ssh', 'ssh://admin@{{host}}'],
    ],
  ),
  device(
    'KVM — machine room',
    '10.1.30.50',
    'Drawer KVM for the playout and graphics hosts. The local console is slower than it looks.',
    'compute',
    'machine',
    'aten',
    'monitor',
    'none',
    [
      ['Client', 'web', 'https://{{host}}/'],
      ['Service', 'ssh', 'ssh://kvm@{{host}}'],
    ],
    undefined,
    'kvm-drawer',
  ),
  device(
    'Patch — audio bay',
    '10.1.10.80',
    'Smart patch controller for the audio bay. The paper labels are still the authority.',
    'audio',
    'rack-3',
    'lawo',
    'cable',
    'up',
    [['Bay', 'web', 'https://{{host}}/']],
    'Paper labels win',
  ),
  device(
    'Intercom antenna — studio 1',
    '10.1.20.61',
    'FreeSpeak antenna over the cyc. A down state here is a quiet floor, not a quiet panel.',
    'intercom',
    'studio-1',
    'clearcom',
    'antenna',
    'down',
    [['Status', 'web', 'https://{{host}}/']],
  ),
  device(
    'Intercom antenna — studio 2',
    '10.1.21.61',
    'FreeSpeak antenna for the smaller studio. It shares the Eclipse matrix with studio 1.',
    'intercom',
    'studio-2',
    'clearcom',
    'antenna',
    'up',
    [['Status', 'web', 'https://{{host}}/']],
  ),
  device(
    'Studio 2 lighting',
    '10.1.21.51',
    'Smaller desk for studio 2. The “interview” look is page 2.',
    'lighting',
    'studio-2',
    'ma',
    'lightbulb',
    'none',
    [['Desk', 'web', 'https://{{host}}/']],
  ),
  device(
    'Sony camera — studio 2',
    '10.1.21.11',
    'Single pedestal for the side studio. There is no camera B, despite the label on the CCU.',
    'video',
    'studio-2',
    'sony',
    'camera',
    'up',
    [
      ['CCU', 'web', 'https://{{host}}/'],
      ['API', 'api', 'https://{{host}}/api/status'],
    ],
  ),
  device(
    'Audio recorder — machine room',
    '10.1.30.61',
    'Continuous recorder for both programmes. The files are dated in house time, not UTC.',
    'audio',
    'machine',
    'lawo',
    'disc-3',
    'up',
    [
      ['Files', 'web', 'https://{{host}}/'],
      ['API', 'api', 'https://{{host}}/api/files'],
      ['Service', 'ssh', 'ssh://rec@{{host}}'],
    ],
    'House time, not UTC',
  ),
  device(
    'Multiviewer — control A',
    '10.1.10.70',
    'The wall in front of the director. Layout “news” is the one with the big programme tile.',
    'video',
    'control-a',
    'blackmagic',
    'tv',
    'up',
    [['Layout', 'web', 'https://{{host}}/']],
  ),
  device(
    'Multiviewer — machine room',
    '10.1.30.70',
    'Engineering multiviewer. It shows signals the control rooms have already cropped away.',
    'video',
    'machine',
    'blackmagic',
    'tv',
    'unknown',
    [['Layout', 'web', 'https://{{host}}/']],
  ),
  device(
    'House power — rack 3 PDU A',
    '10.1.40.51',
    'A-side PDU. The B-side is the next address, and it is not a spare.',
    'compute',
    'rack-3',
    'aten',
    'plug',
    'up',
    [['Outlets', 'web', 'https://{{host}}/']],
  ),
  device(
    'House power — rack 3 PDU B',
    '10.1.40.52',
    'B-side PDU. A down state here is a real outage, not a monitoring gap.',
    'compute',
    'rack-3',
    'aten',
    'plug',
    'down',
    [['Outlets', 'web', 'https://{{host}}/']],
  ),
  device(
    'Temperature — rack 3 top',
    '10.1.40.61',
    'Sensor at the top of rack 3. The number on the door is this sensor, not the return air.',
    'compute',
    'rack-3',
    'sensaphone',
    'thermometer',
    'up',
    [['Reading', 'web', 'https://{{host}}/']],
  ),
  device(
    'Phone hybrid — control A',
    '10.1.10.90',
    'Caller hybrid. The hold music is the one everyone complains about, and it is on purpose.',
    'audio',
    'control-a',
    'sonifex',
    'phone',
    'none',
    [
      ['Hybrid', 'web', 'https://{{host}}/'],
      ['Service', 'ssh', 'ssh://hybrid@{{host}}'],
    ],
  ),
  device(
    'Satellite IRD — rack 3',
    '10.1.40.71',
    'Incoming feed receiver. The “lock” light lies less often than the web page.',
    'video',
    'rack-3',
    'harmonic',
    'satellite-dish',
    'unknown',
    [
      ['Status', 'web', 'https://{{host}}/'],
      ['API', 'api', 'https://{{host}}/api/lock'],
    ],
  ),
  device(
    'Commentary codec',
    '10.1.11.80',
    'Two-channel commentary return. Studio 2 uses the second channel even when the sheet says otherwise.',
    'audio',
    'control-b',
    'comrex',
    'mic',
    'up',
    [
      ['Codec', 'web', 'https://{{host}}/'],
      ['API', 'api', 'https://{{host}}/api/'],
      ['Service', 'ssh', 'ssh://codec@{{host}}'],
    ],
    'Channel 2 is studio 2',
  ),
]

export function seedDemo(): { entries: number; filters: number } {
  const actor = adminActor()
  clearPreviousDemo(actor)
  ensureNamespaces(actor)
  ensureFields(actor)
  const entryIds: string[] = []
  for (const [index, item] of devices.entries()) {
    const created = createEntry(actor, {
      name: item.name,
      description: item.description,
      host: item.host,
      iconRef: `lucide:${item.icon}`,
      sort: index,
      tags: [`type:${item.type}`, `room:${item.room}`, `vendor:${item.vendor}`],
      links: item.links.map((link, linkIndex) => ({
        label: link.label,
        urlTemplate: link.url,
        type: link.type,
        isPrimary: linkIndex === 0,
        sort: linkIndex,
        iconRef: null,
      })),
      fields: [
        ...(item.note ? [{ key: 'note', value: item.note }] : []),
        ...(item.password ? [{ key: 'password', value: item.password }] : []),
      ],
      checks:
        item.status === 'none'
          ? []
          : [
              {
                name: 'Reachable',
                kind: 'tcp' as const,
                executor: 'server' as const,
                intervalSeconds: 60,
                timeoutMs: 3000,
                tlsVerify: false,
                host: item.host,
                port: item.links.some((link) => link.type === 'ssh') ? 22 : 443,
                linkLabel: null,
                requestSpec: null,
              },
            ],
      actions: [],
      confirmDuplicates: true,
    })
    entryIds.push(created.entry.id)
    const check = created.entry.checks[0]
    if (check && item.status !== 'none') {
      writeStatus(
        check.id,
        {
          state: item.status,
          latencyMs: item.status === 'up' ? 12 : null,
          message:
            item.status === 'down'
              ? 'Offline since 14:32'
              : item.status === 'unknown'
                ? 'No recent reply'
                : 'Reachable',
        },
        'demo',
      )
    }
  }
  const rooms = createFilter(actor, {
    name: 'Control rooms',
    query: '',
    columns: ['note', 'password'],
    groupBy: 'room',
    sort: 0,
    icon: 'lucide:layout-grid',
    isPublic: true,
    global: true,
    viewMode: 'tiles',
  })
  const audio = createFilter(actor, {
    name: 'Audio desk',
    query: 'type:audio',
    columns: ['note'],
    groupBy: 'room',
    sort: 1,
    icon: 'lucide:audio-lines',
    isPublic: true,
    global: true,
    viewMode: 'tiles',
  })
  writeDemoRecord({ entryIds, filterIds: [rooms.id, audio.id] })
  writeSettings(
    {
      siteTitle: 'Studio 1 Devices',
      siteClaim: 'If it beeps, it lives here.',
      accentPreset: 'blue',
      allTabPublic: true,
    },
    actor.userId,
  )
  return { entries: entryIds.length, filters: 2 }
}

function device(
  name: string,
  host: string,
  description: string,
  type: string,
  room: string,
  vendor: string,
  icon: string,
  status: Status,
  links: Array<[string, 'web' | 'api' | 'ssh', string]>,
  note?: string,
  password?: string,
): Device {
  return {
    name,
    host,
    description,
    type,
    room,
    vendor,
    icon,
    status,
    links: links.map(([label, linkType, url]) => ({ label, type: linkType, url })),
    note,
    password,
  }
}

function adminActor(): Actor {
  const user = getDatabase().select().from(users).where(eq(users.role, 'admin')).get()
  if (!user) {
    throw new Error('Seed needs an admin user. Set ADMIN_USERNAME and ADMIN_PASSWORD.')
  }
  return {
    role: 'admin',
    userId: user.id,
    tokenId: null,
    tokenScopes: [],
    kind: 'user',
    label: user.username,
  }
}

function ensureNamespaces(actor: Actor): void {
  const namespaces = [
    ['type', 'Type', '#2563eb', 0],
    ['room', 'Room', '#d97706', 1],
    ['vendor', 'Vendor', '#7c3aed', 2],
  ] as const
  for (const [name, label, colour, sort] of namespaces) {
    const found = getDatabase()
      .select()
      .from(tagNamespaces)
      .where(eq(tagNamespaces.name, name))
      .get()
    if (found) {
      continue
    }
    createNamespace(actor, { name, label, colour, sort, showInSidebar: true })
  }
}

function ensureFields(actor: Actor): void {
  const keys = new Set(
    getDatabase()
      .select()
      .from(fieldDefinitions)
      .all()
      .map((field) => field.key),
  )
  if (!keys.has('note')) {
    createFieldDefinition(actor, {
      key: 'note',
      label: 'Note',
      type: 'text',
      minRoleToView: 'anonymous',
      searchable: true,
      showAsColumnDefault: true,
      sort: 0,
    })
  }
  if (!keys.has('password')) {
    createFieldDefinition(actor, {
      key: 'password',
      label: 'Password',
      type: 'secret',
      minRoleToView: 'viewer',
      searchable: false,
      showAsColumnDefault: true,
      sort: 1,
    })
  }
}

function clearPreviousDemo(actor: Actor): void {
  const record = readDemoRecord()
  if (!record) {
    return
  }
  for (const id of record.entryIds) {
    try {
      deleteEntry(actor, id)
    } catch {
      // A previous demo entry may already have been removed.
    }
  }
  for (const id of record.filterIds) {
    try {
      deleteFilter(actor, id)
    } catch {
      // A previous demo tab may already have been removed.
    }
  }
}

function readDemoRecord(): DemoRecord | null {
  const row = getDatabase().select().from(settings).where(eq(settings.key, demoSettingKey)).get()
  const value = row?.value
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  if (!('entryIds' in value) || !('filterIds' in value)) {
    return null
  }
  const entryIds = value.entryIds
  const filterIds = value.filterIds
  if (!Array.isArray(entryIds) || !Array.isArray(filterIds)) {
    return null
  }
  return {
    entryIds: entryIds.filter((id): id is string => typeof id === 'string'),
    filterIds: filterIds.filter((id): id is string => typeof id === 'string'),
  }
}

function writeDemoRecord(record: DemoRecord): void {
  const timestamp = now()
  getDatabase()
    .insert(settings)
    .values({
      key: demoSettingKey,
      value: record,
      createdAt: timestamp,
      updatedAt: timestamp,
      updatedBy: null,
    })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: record, updatedAt: timestamp },
    })
    .run()
}
