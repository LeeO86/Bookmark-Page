#!/usr/bin/python
# -*- coding: utf-8 -*-

# Copyright (c) Bookmark-Page
# GNU General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
# SPDX-License-Identifier: GPL-3.0-or-later

from __future__ import absolute_import, division, print_function
__metaclass__ = type

DOCUMENTATION = r'''
---
module: filter
short_description: Manage a global Bookmark-Page filter tab
description:
  - Create, update, or delete one global filter.
  - Personal filters with the same name are left alone.
version_added: "2.0.0"
author:
  - Bookmark-Page (@leeo86)
extends_documentation_fragment:
  - leeo86.bookmarks.bookmarks
options:
  name:
    description:
      - Tab name. This identifies the global filter.
    type: str
    required: true
  state:
    description:
      - Whether the global filter should exist.
    type: str
    choices: [present, absent]
    default: present
  query:
    description:
      - Query shown when the tab is selected.
    type: str
    default: ""
  columns:
    description:
      - Column keys shown for this tab.
    type: list
    elements: str
    default: []
  group_by:
    description:
      - Namespace used to group rows. Empty leaves grouping off.
    type: str
  sort:
    description:
      - Tab order.
    type: int
    default: 0
  icon:
    description:
      - Icon reference. A bare name selects a Lucide icon.
    type: str
  is_public:
    description:
      - Allow anonymous visitors to use this tab.
    type: bool
    default: false
'''

EXAMPLES = r'''
- name: Publish an audio tab
  leeo86.bookmarks.filter:
    name: Audio
    query: type:audio
    is_public: true
'''

RETURN = r'''
filter:
  description: The filter after the change, when it still exists.
  type: dict
  returned: when state is present and check mode is not used
'''


def desired_filter(params):
    icon = params.get('icon')
    return {
        'name': params['name'],
        'query': params.get('query') or '',
        'columns': list(params.get('columns') or []),
        'groupBy': params.get('group_by') or None,
        'sort': params.get('sort') or 0,
        'icon': normalize_icon(icon) if icon else None,
        'isPublic': bool(params.get('is_public')),
    }


def current_view(current):
    return {
        'name': current.get('name'),
        'query': current.get('query') or '',
        'columns': list(current.get('columns') or []),
        'groupBy': current.get('groupBy') or None,
        'sort': current.get('sort') or 0,
        'icon': current.get('icon') or None,
        'isPublic': bool(current.get('isPublic')),
    }


from ansible.module_utils.basic import AnsibleModule
from ansible_collections.leeo86.bookmarks.plugins.module_utils.bookmarks import (
    api,
    common_argument_spec,
    normalize_icon,
    quote_path,
)


def main():
    spec = common_argument_spec()
    spec.update(
        name=dict(type='str', required=True),
        state=dict(type='str', choices=['present', 'absent'], default='present'),
        query=dict(type='str', default=''),
        columns=dict(type='list', elements='str', default=[]),
        group_by=dict(type='str'),
        sort=dict(type='int', default=0),
        icon=dict(type='str'),
        is_public=dict(type='bool', default=False),
    )
    module = AnsibleModule(argument_spec=spec, supports_check_mode=True)
    name = module.params['name']
    filters = api(module, 'GET', '/api/v1/filters').get('filters') or []
    matches = [
        item for item in filters if item.get('name') == name and item.get('ownerUserId') is None
    ]
    if len(matches) > 1:
        module.fail_json(msg='More than one global filter is named %s' % name)
    current = matches[0] if matches else None
    if module.params['state'] == 'absent':
        if current is None:
            module.exit_json(changed=False)
        diff = {'before': {'name': name}, 'after': {}}
        if module.check_mode:
            module.exit_json(changed=True, diff=diff)
        api(module, 'DELETE', '/api/v1/filters/%s' % quote_path(current['id']))
        module.exit_json(changed=True, diff=diff)
    desired = desired_filter(module.params)
    before = current_view(current) if current is not None else {}
    diff = {'before': before, 'after': desired}
    if before == desired:
        module.exit_json(changed=False, diff=diff, filter=current)
    if module.check_mode:
        module.exit_json(changed=True, diff=diff)
    body = dict(desired)
    if current is None:
        body['global'] = True
        created = api(module, 'POST', '/api/v1/filters', body)
        module.exit_json(changed=True, diff=diff, filter=created)
    updated = api(module, 'PATCH', '/api/v1/filters/%s' % quote_path(current['id']), body)
    module.exit_json(changed=True, diff=diff, filter=updated)


if __name__ == '__main__':
    main()
