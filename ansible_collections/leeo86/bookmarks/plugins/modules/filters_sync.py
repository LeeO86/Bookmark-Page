#!/usr/bin/python
# -*- coding: utf-8 -*-

# Copyright (c) Bookmark-Page
# GNU General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
# SPDX-License-Identifier: GPL-3.0-or-later

from __future__ import absolute_import, division, print_function
__metaclass__ = type

DOCUMENTATION = r'''
---
module: filters_sync
short_description: Synchronise shared tabs owned by one scope
description:
- Create or update global tabs by scope and stable external key.
- Purge removes only tabs owned by this scope. Manual tabs, personal tabs and other
  scopes are preserved.
- Existing manual tabs are never adopted by name.
version_added: 2.2.0
author:
- Bookmark-Page (@leeo86)
extends_documentation_fragment:
- leeo86.bookmarks.bookmarks
options:
  scope:
    description:
    - Owning automation scope.
    type: str
    required: true
  purge:
    description:
    - Remove owned tabs missing from O(filters).
    type: bool
    default: false
  filters:
    description:
    - Complete desired list for this scope.
    type: list
    elements: dict
    required: true
    suboptions:
      external_key:
        description:
        - Stable key inside the scope.
        type: str
        required: true
      name:
        description:
        - Tab display name.
        type: str
        required: true
      query:
        description:
        - Bookmark query.
        type: str
        default: ''
      icon:
        description:
        - Optional tab icon reference.
        type: str
      group_by:
        description:
        - Grouping namespace.
        type: str
      sort:
        description:
        - Tab order.
        type: int
        default: 0
      view_mode:
        description:
        - Default layout.
        type: str
        choices:
        - cards
        - tiles
        - list
        default: cards
      columns:
        description:
        - Column keys.
        type: list
        elements: str
        default: []
      is_public:
        description:
        - Whether anonymous visitors can use this tab. Omit to preserve existing visibility
          or use the default for a new shared tab.
        type: bool
'''

EXAMPLES = r'''
- name: Synchronise MXL tabs
  leeo86.bookmarks.filters_sync:
    scope: mxl
    purge: true
    filters:
      - external_key: production
        name: Production
        query: production:*
        is_public: true
'''

RETURN = r'''
created:
  description: External keys of created tabs.
  type: list
  elements: str
  returned: always
updated:
  description: External keys of updated tabs.
  type: list
  elements: str
  returned: always
deleted:
  description: External keys of deleted tabs.
  type: list
  elements: str
  returned: always
unchanged:
  description: External keys of unchanged tabs.
  type: list
  elements: str
  returned: always
'''

from ansible.module_utils.basic import AnsibleModule
from ansible_collections.leeo86.bookmarks.plugins.module_utils.bookmarks import api, common_argument_spec, normalize_icon, quote_path


def main():
    options = dict(external_key=dict(type='str', required=True, no_log=False), name=dict(type='str', required=True),
                   query=dict(type='str', default=''), icon=dict(type='str'), group_by=dict(type='str'),
                   sort=dict(type='int', default=0), view_mode=dict(type='str', default='cards', choices=['cards', 'tiles', 'list']),
                   columns=dict(type='list', elements='str', default=[]), is_public=dict(type='bool'))
    spec = common_argument_spec()
    spec.update(scope=dict(type='str', required=True), purge=dict(type='bool', default=False),
                filters=dict(type='list', elements='dict', required=True, options=options))
    module = AnsibleModule(argument_spec=spec, supports_check_mode=True)
    desired = []
    for item in module.params['filters']:
        tab = dict(externalKey=item['external_key'], name=item['name'], query=item['query'],
                   icon=normalize_icon(item.get('icon')), groupBy=item.get('group_by') or None, sort=item['sort'],
                   viewMode=item['view_mode'], columns=item['columns'])
        if item.get('is_public') is not None:
            tab['isPublic'] = item['is_public']
        desired.append(tab)
    scope = module.params['scope']
    current = [item for item in api(module, 'GET', '/api/v1/filters').get('filters', []) if item.get('scope') == scope]
    result = api(module, 'POST', '/api/v1/scopes/%s/filters/sync' % quote_path(scope),
                 dict(filters=desired, purge=module.params['purge'], dryRun=module.check_mode))
    changed = bool(result.get('created') or result.get('updated') or result.get('deleted'))
    module.exit_json(changed=changed, diff={'before': current, 'after': {'filters': desired, 'purge': module.params['purge']}}, **result)


if __name__ == '__main__':
    main()
