#!/usr/bin/python
# -*- coding: utf-8 -*-

# Copyright (c) Bookmark-Page
# GNU General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
# SPDX-License-Identifier: GPL-3.0-or-later

from __future__ import absolute_import, division, print_function
__metaclass__ = type

DOCUMENTATION = r'''
---
module: icon
short_description: Manage an uploaded Bookmark-Page icon
description:
- Identify icons by their exact unique name.
- Changed content replaces the existing icon while preserving its ID and references.
- Content comparisons use the sanitised content hash. File paths refer to the module
  execution host.
version_added: 2.2.0
author:
- Bookmark-Page (@leeo86)
extends_documentation_fragment:
- leeo86.bookmarks.bookmarks
options:
  name:
    description:
    - Unique uploaded icon name.
    type: str
    required: true
  src:
    description:
    - Image file path. Mutually exclusive with O(content).
    type: path
  content:
    description:
    - Standard Base64 image data. Mutually exclusive with O(src).
    type: str
  content_type:
    description:
    - Image media type. Inferred from the file name or bytes when omitted.
    type: str
    choices:
    - image/svg+xml
    - image/png
    - image/webp
  state:
    description:
    - Whether the icon exists.
    type: str
    choices:
    - present
    - absent
    default: present
'''

EXAMPLES = r'''
- name: Install the mixer icon
  leeo86.bookmarks.icon:
    name: mxl-mixer
    src: /srv/icons/mixer.svg
'''

RETURN = r'''
id:
  description: Stable uploaded icon ID.
  type: str
  returned: when the icon exists or existed
ref:
  description: Stable upload reference usable by entries.
  type: str
  returned: when the icon exists or existed
'''

from ansible.module_utils.basic import AnsibleModule
from ansible_collections.leeo86.bookmarks.plugins.module_utils.bookmarks import api, common_argument_spec, image_payload, quote_path


def main():
    spec = common_argument_spec()
    spec.update(name=dict(type='str', required=True), src=dict(type='path'), content=dict(type='str', no_log=True),
                content_type=dict(type='str', choices=['image/svg+xml', 'image/png', 'image/webp']),
                state=dict(type='str', default='present', choices=['present', 'absent']))
    module = AnsibleModule(argument_spec=spec, supports_check_mode=True, mutually_exclusive=[['src', 'content']],
                           required_if=[('state', 'present', ['src', 'content'], True)])
    name = module.params['name']
    matches = api(module, 'GET', '/api/v1/icons?name=' + quote_path(name)).get('icons') or []
    current = matches[0] if matches else None
    if module.params['state'] == 'absent':
        if current and not module.check_mode:
            api(module, 'DELETE', '/api/v1/icons/' + quote_path(current['id']))
        module.exit_json(changed=bool(current), id=current['id'] if current else None,
                         ref=current['ref'] if current else None,
                         diff={'before': current or {}, 'after': {}})
    payload = image_payload(module, module.params['src'], module.params['content'], module.params['content_type'])
    payload['name'] = name
    preview = api(module, 'POST', '/api/v1/icons/preview', payload)
    before = {key: current.get(key) for key in ('name', 'mediaType', 'contentHash')} if current else {}
    after = dict(name=name, mediaType=payload['contentType'], contentHash=preview['contentHash'])
    changed = before != after
    result = current or {}
    if changed and not module.check_mode:
        result = api(module, 'PUT' if current else 'POST',
                     '/api/v1/icons/' + quote_path(current['id']) if current else '/api/v1/icons', payload)
    module.exit_json(changed=changed, id=result.get('id'), ref=result.get('ref'),
                     diff={'before': before, 'after': after})


if __name__ == '__main__':
    main()
