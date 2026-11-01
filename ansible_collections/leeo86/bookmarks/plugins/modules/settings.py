#!/usr/bin/python
# -*- coding: utf-8 -*-

# Copyright (c) Bookmark-Page
# GNU General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
# SPDX-License-Identifier: GPL-3.0-or-later

from __future__ import absolute_import, division, print_function
__metaclass__ = type

DOCUMENTATION = r'''
---
module: settings
short_description: Manage Bookmark-Page settings and branding
description:
- Compare and change only explicitly supplied options.
- Colour comparisons ignore case. Custom accent colours require the custom preset.
- Image comparisons use hashes after server-side validation and SVG sanitising.
- Check mode previews changes without writing settings or images.
version_added: 2.2.0
author:
- Bookmark-Page (@leeo86)
extends_documentation_fragment:
- leeo86.bookmarks.bookmarks
options:
  site_title:
    description:
    - Desired value for C(siteTitle). Omit to preserve the current setting.
    type: str
  site_claim:
    description:
    - Desired value for C(siteClaim). Omit to preserve the current setting.
    type: str
  accent_preset:
    description:
    - Desired value for C(accentPreset). Omit to preserve the current setting.
    type: str
    choices:
    - red
    - yellow
    - pink
    - green
    - cyan
    - blue
    - grey
    - custom
  accent_colour:
    description:
    - Desired value for C(accentColour). Omit to preserve the current setting.
    type: str
  favicon_colour:
    description:
    - Desired value for C(faviconColour). Omit to preserve the current setting.
    type: str
  neutral_palette:
    description:
    - Desired value for C(neutralPalette). Omit to preserve the current setting.
    type: str
    choices:
    - slate
    - gray
    - zinc
    - neutral
    - stone
  default_colour_mode:
    description:
    - Desired value for C(defaultColourMode). Omit to preserve the current setting.
    type: str
    choices:
    - system
    - light
    - dark
  background:
    description:
    - Desired value for C(background). Omit to preserve the current setting.
    type: str
    choices:
    - gradient
    - tint
    - plain
  all_tab_public:
    description:
    - Desired value for C(allTabPublic). Omit to preserve the current setting.
    type: bool
  shared_tabs_public_by_default:
    description:
    - Desired value for C(sharedTabsPublicByDefault). Omit to preserve the current
      setting.
    type: bool
  client_checks_anonymous:
    description:
    - Desired value for C(clientChecksAnonymous). Omit to preserve the current setting.
    type: bool
  favicon_tls_verify:
    description:
    - Desired value for C(faviconTlsVerify). Omit to preserve the current setting.
    type: bool
  favicon_refresh_days:
    description:
    - Desired value for C(faviconRefreshDays). Omit to preserve the current setting.
    type: int
  audit_retention_days:
    description:
    - Desired value for C(auditRetentionDays). Omit to preserve the current setting.
    type: int
  default_scope_edit_mode:
    description:
    - Desired value for C(defaultScopeEditMode). Omit to preserve the current setting.
    type: str
    choices:
    - locked
    - field_ownership
    - free
  logo_src:
    description:
    - Path on the module execution host to a PNG, JPEG, WebP or SVG logo. Empty removes
      the custom logo.
    type: path
  tab_icon_src:
    description:
    - Path on the module execution host to a PNG or WebP browser icon. Empty removes
      the custom icon.
    type: path
'''

EXAMPLES = r'''
- name: Configure the portal
  leeo86.bookmarks.settings:
    site_title: MXL
    all_tab_public: true
    accent_preset: blue
'''

RETURN = r'''
settings:
  description: Selected settings and image hashes after the change or preview.
  type: dict
  returned: always
'''

from ansible.module_utils.basic import AnsibleModule
from ansible_collections.leeo86.bookmarks.plugins.module_utils.bookmarks import api, common_argument_spec, image_payload

SETTINGS = {
    'site_title': ('siteTitle', 'str', None),
    'site_claim': ('siteClaim', 'str', None),
    'accent_preset': ('accentPreset', 'str', ['red', 'yellow', 'pink', 'green', 'cyan', 'blue', 'grey', 'custom']),
    'accent_colour': ('accentColour', 'str', None),
    'favicon_colour': ('faviconColour', 'str', None),
    'neutral_palette': ('neutralPalette', 'str', ['slate', 'gray', 'zinc', 'neutral', 'stone']),
    'default_colour_mode': ('defaultColourMode', 'str', ['system', 'light', 'dark']),
    'background': ('background', 'str', ['gradient', 'tint', 'plain']),
    'all_tab_public': ('allTabPublic', 'bool', None),
    'shared_tabs_public_by_default': ('sharedTabsPublicByDefault', 'bool', None),
    'client_checks_anonymous': ('clientChecksAnonymous', 'bool', None),
    'favicon_tls_verify': ('faviconTlsVerify', 'bool', None),
    'favicon_refresh_days': ('faviconRefreshDays', 'int', None),
    'audit_retention_days': ('auditRetentionDays', 'int', None),
    'default_scope_edit_mode': ('defaultScopeEditMode', 'str', ['locked', 'field_ownership', 'free']),
}

PRESETS = {'red': '#ef4444', 'yellow': '#f59e0b', 'pink': '#ec4899', 'green': '#22c55e',
           'cyan': '#06b6d4', 'blue': '#3b82f6', 'grey': '#64748b'}


def main():
    spec = common_argument_spec()
    for key, setting in SETTINGS.items():
        kind, choices = setting[1], setting[2]
        spec[key] = dict(type=kind, **({'choices': choices} if choices else {}))
    spec.update(logo_src=dict(type='path'), tab_icon_src=dict(type='path'))
    module = AnsibleModule(argument_spec=spec, supports_check_mode=True)
    desired = {setting[0]: module.params[key] for key, setting in SETTINGS.items() if module.params[key] is not None}
    if 'siteTitle' in desired:
        desired['siteTitle'] = desired['siteTitle'].strip()
        if not 1 <= len(desired['siteTitle']) <= 200:
            module.fail_json(msg='site_title must contain 1 to 200 characters')
    if 'siteClaim' in desired and len(desired['siteClaim']) > 500:
        module.fail_json(msg='site_claim must contain at most 500 characters')
    for key in ('accentColour', 'faviconColour'):
        if key in desired:
            import re
            if not re.fullmatch(r'#[0-9a-fA-F]{6}', desired[key]):
                module.fail_json(msg='%s must be a six-digit hex colour' % key)
    for key, low, high in [('faviconRefreshDays', 1, 365), ('auditRetentionDays', 0, 36500)]:
        if key in desired and not low <= desired[key] <= high:
            module.fail_json(msg='%s must be between %s and %s' % (key, low, high))
    current = api(module, 'GET', '/api/v1/settings')
    preset = desired.get('accentPreset', current.get('accentPreset'))
    if 'accentColour' in desired and preset in PRESETS and desired['accentColour'].lower() != PRESETS[preset]:
        module.fail_json(msg='Set accent_preset=custom when providing a custom accent_colour')
    before = {key: current.get(key) for key in desired}

    def same(key):
        if key.endswith('Colour'):
            return str(before[key]).lower() == str(desired[key]).lower()
        return before[key] == desired[key]
    patch = {key: value for key, value in desired.items() if not same(key)}
    after = dict(desired)
    images = []
    for option, endpoint, hash_key in [('logo_src', 'logo', 'logoHash'), ('tab_icon_src', 'favicon', 'tabFaviconHash')]:
        src = module.params[option]
        if src is None:
            continue
        payload = image_payload(module, src) if src else None
        target_hash = api(module, 'POST', '/api/v1/settings/%s/preview' % endpoint, payload)['contentHash'] if src else None
        before[hash_key] = current.get(hash_key)
        after[hash_key] = target_hash
        if before[hash_key] != target_hash:
            images.append((endpoint, payload))
    changed = bool(patch or images)
    if not module.check_mode:
        if patch:
            api(module, 'PATCH', '/api/v1/settings', patch)
        for endpoint, payload in images:
            api(module, 'POST' if payload else 'DELETE', '/api/v1/settings/' + endpoint, payload)
    module.exit_json(changed=changed, diff={'before': before, 'after': after}, settings=after)


if __name__ == '__main__':
    main()
