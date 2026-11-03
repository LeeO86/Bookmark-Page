#!/usr/bin/python
# -*- coding: utf-8 -*-
# Copyright (c) Bookmark-Page
# GNU General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
# SPDX-License-Identifier: GPL-3.0-or-later
from __future__ import absolute_import, division, print_function
__metaclass__ = type

DOCUMENTATION = r'''
---
module: entry_favicon
short_description: Supply and retain an entry favicon on the portal
version_added: 2.3.0
author:
- Bookmark-Page (@leeo86)
description:
- Identify an existing entry by O(id) or by O(scope) and O(external_key).
- Read image data on the host where the module executes. URL downloads use bounded HTTP(S) requests.
- Compare the sanitised content hash and provenance; repeated supply is unchanged.
- Does not change the entry icon choice. Supplied images are retained until explicitly replaced or removed.
extends_documentation_fragment:
- leeo86.bookmarks.bookmarks
options:
  id:
    description: [Entry identifier.]
    type: str
  scope:
    description: [Ansible scope used with O(external_key).]
    type: str
  external_key:
    description: [External key used with O(scope).]
    type: str
  src:
    description: [Image path on the module execution host.]
    type: path
  content:
    description: [Standard Base64 image data.]
    type: str
  url:
    description: [HTTP(S) URL downloaded on the module execution host.]
    type: str
  content_type:
    description: [Optional image MIME type. Inferred from bytes when omitted.]
    type: str
  timeout:
    description: [Download timeout in seconds.]
    type: int
    default: 5
  max_bytes:
    description: [Download and input size limit. The server also enforces its own favicon limit.]
    type: int
    default: 524288
'''
EXAMPLES = r'''
- name: Supply a device icon from a reachable automation host
  leeo86.bookmarks.entry_favicon:
    scope: devices
    external_key: mixer
    url: http://device.example/icon.ico
    validate_certs: true
'''
RETURN = r'''
id:
  description: Entry identifier.
  type: str
  returned: always
content_hash:
  description: SHA256 of the sanitised image.
  type: str
  returned: always
'''
from ansible.module_utils.basic import AnsibleModule
from ansible_collections.leeo86.bookmarks.plugins.module_utils.bookmarks import api, common_argument_spec, find_managed, quote_path
from ansible_collections.leeo86.bookmarks.plugins.module_utils.favicon import FaviconError, image_data


def main():
    spec = common_argument_spec()
    spec.update(id=dict(type='str'), scope=dict(type='str'), external_key=dict(type='str', no_log=False),
                src=dict(type='path'), content=dict(type='str', no_log=True), url=dict(type='str', no_log=True),
                content_type=dict(type='str'), timeout=dict(type='int', default=5), max_bytes=dict(type='int', default=524288))
    module = AnsibleModule(argument_spec=spec, supports_check_mode=True,
                           mutually_exclusive=[['id', 'scope'], ['id', 'external_key'], ['src', 'content', 'url']],
                           required_one_of=[['id', 'scope'], ['src', 'content', 'url']], required_together=[['scope', 'external_key']])
    identifier = module.params['id']
    if not identifier:
        entry = find_managed(module, module.params['scope'], module.params['external_key'])
        if not entry:
            module.fail_json(msg='The entry does not exist in the selected scope')
        identifier = entry['id']
    try:
        payload = image_data(src=module.params['src'], content=module.params['content'], content_type=module.params['content_type'],
                             url=module.params['url'], validate_certs=module.params['validate_certs'],
                             timeout=module.params['timeout'], max_bytes=module.params['max_bytes'])
    except FaviconError as error:
        module.fail_json(msg=str(error))
    path = '/api/v1/entries/' + quote_path(identifier) + '/favicon'
    preview = api(module, 'POST', path + '/preview', payload)
    before = {'contentHash': preview['currentHash'], 'source': preview['currentSource']}
    after = {'contentHash': preview['contentHash'], 'source': 'supplied'}
    changed = before != after
    if changed and not module.check_mode:
        api(module, 'PUT', path, payload)
    module.exit_json(changed=changed, id=identifier, content_hash=preview['contentHash'], diff={'before': before, 'after': after})


if __name__ == '__main__':
    main()
