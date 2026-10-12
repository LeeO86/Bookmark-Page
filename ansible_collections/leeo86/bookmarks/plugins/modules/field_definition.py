#!/usr/bin/python
# -*- coding: utf-8 -*-

# Copyright (c) Bookmark-Page
# GNU General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
# SPDX-License-Identifier: GPL-3.0-or-later

from __future__ import absolute_import, division, print_function
__metaclass__ = type

DOCUMENTATION = r'''
---
module: field_definition
short_description: Manage a Bookmark-Page custom field
description:
  - Create, update, or delete one field definition.
  - The field O(key) cannot be changed. A secret field is never searchable.
version_added: "2.0.0"
author:
  - Bookmark-Page (@leeo86)
extends_documentation_fragment:
  - leeo86.bookmarks.bookmarks
options:
  key:
    description:
      - Field key. Lowercase letters, digits, and underscores.
    type: str
    required: true
  state:
    description:
      - Whether the field should exist.
    type: str
    choices: [present, absent]
    default: present
  label:
    description:
      - Column label. Required when O(state=present).
    type: str
  type:
    description:
      - Stored value type. Required when O(state=present).
    type: str
    choices: [text, url, number, secret]
  min_role:
    description:
      - Minimum role that can see the value. Required when O(state=present).
    type: str
    choices: [anonymous, viewer, editor, admin]
  searchable:
    description:
      - Include the value in text search. Forced off for secret fields.
    type: bool
    default: false
  show_as_column:
    description:
      - Show the field as a table column by default.
    type: bool
    default: false
  sort:
    description:
      - Column order.
    type: int
    default: 0
notes:
  - Deleting a field deletes its stored values.
'''

EXAMPLES = r'''
- name: Ensure a note field
  leeo86.bookmarks.field_definition:
    key: note
    label: Note
    type: text
    min_role: viewer
    searchable: true
    show_as_column: true
'''

RETURN = r'''
field:
  description: The field definition after the change, when it still exists.
  type: dict
  returned: when state is present and check mode is not used
'''


from ansible.module_utils.basic import AnsibleModule
from ansible_collections.leeo86.bookmarks.plugins.module_utils.bookmarks import (
    FIELD_TYPES,
    ROLES,
    api,
    common_argument_spec,
    quote_path,
)


def main():
    spec = common_argument_spec()
    spec.update(
        key=dict(type='str', required=True, no_log=False),
        state=dict(type='str', choices=['present', 'absent'], default='present'),
        label=dict(type='str'),
        type=dict(type='str', choices=FIELD_TYPES),
        min_role=dict(type='str', choices=ROLES),
        searchable=dict(type='bool', default=False),
        show_as_column=dict(type='bool', default=False),
        sort=dict(type='int', default=0),
    )
    module = AnsibleModule(
        argument_spec=spec,
        supports_check_mode=True,
        required_if=[('state', 'present', ['label', 'type', 'min_role'])],
    )
    key = module.params['key']
    fields = api(module, 'GET', '/api/v1/fields').get('fields') or []
    matches = [item for item in fields if item.get('key') == key]
    if len(matches) > 1:
        module.fail_json(msg='More than one field is keyed %s' % key)
    current = matches[0] if matches else None
    if module.params['state'] == 'absent':
        if current is None:
            module.exit_json(changed=False)
        diff = {'before': {'key': key}, 'after': {}}
        if module.check_mode:
            module.exit_json(changed=True, diff=diff)
        api(module, 'DELETE', '/api/v1/fields/%s' % quote_path(current['id']))
        module.exit_json(changed=True, diff=diff)
    searchable = bool(module.params['searchable'])
    if module.params['type'] == 'secret':
        searchable = False
    desired = {
        'label': module.params['label'],
        'type': module.params['type'],
        'minRoleToView': module.params['min_role'],
        'searchable': searchable,
        'showAsColumnDefault': module.params['show_as_column'],
        'sort': module.params['sort'],
    }
    before = {}
    if current is not None:
        before = {
            'label': current.get('label'),
            'type': current.get('type'),
            'minRoleToView': current.get('minRoleToView'),
            'searchable': current.get('searchable'),
            'showAsColumnDefault': current.get('showAsColumnDefault'),
            'sort': current.get('sort'),
        }
    diff = {'before': before, 'after': desired}
    if before == desired:
        module.exit_json(changed=False, diff=diff, field=current)
    if module.check_mode:
        module.exit_json(changed=True, diff=diff)
    if current is None:
        created = api(module, 'POST', '/api/v1/fields', dict(desired, key=key))
        module.exit_json(changed=True, diff=diff, field=created)
    updated = api(module, 'PATCH', '/api/v1/fields/%s' % quote_path(current['id']), desired)
    module.exit_json(changed=True, diff=diff, field=updated)


if __name__ == '__main__':
    main()
