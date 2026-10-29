#!/usr/bin/python
# -*- coding: utf-8 -*-

# Copyright (c) Bookmark-Page
# GNU General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
# SPDX-License-Identifier: GPL-3.0-or-later

from __future__ import absolute_import, division, print_function
__metaclass__ = type

DOCUMENTATION = r'''
---
module: entry_info
short_description: Query Bookmark-Page entries
description:
  - Read entries visible to the token.
  - O(query) uses the Bookmark-Page query language.
version_added: "2.0.0"
author:
  - Bookmark-Page (@leeo86)
extends_documentation_fragment:
  - leeo86.bookmarks.bookmarks
options:
  query:
    description:
      - Query string. An empty string returns every visible entry.
    type: str
    default: ""
'''

EXAMPLES = r'''
- name: List audio devices
  leeo86.bookmarks.entry_info:
    query: type:audio
  register: audio
'''

RETURN = r'''
entries:
  description: Entries that match the query.
  type: list
  elements: dict
  returned: always
query:
  description: Query that was sent.
  type: str
  returned: always
'''


from urllib.parse import urlencode

from ansible.module_utils.basic import AnsibleModule
from ansible_collections.leeo86.bookmarks.plugins.module_utils.bookmarks import (
    api,
    common_argument_spec,
)


def main():
    spec = common_argument_spec()
    spec.update(query=dict(type='str', default=''))
    module = AnsibleModule(argument_spec=spec, supports_check_mode=True)
    query = module.params['query'] or ''
    path = '/api/v1/entries'
    if query:
        path += '?' + urlencode({'q': query})
    body = api(module, 'GET', path)
    module.exit_json(changed=False, entries=body.get('entries') or [], query=query)


if __name__ == '__main__':
    main()
