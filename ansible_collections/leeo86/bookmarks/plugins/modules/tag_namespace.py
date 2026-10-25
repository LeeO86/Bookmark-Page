#!/usr/bin/python
# -*- coding: utf-8 -*-

# Copyright (c) Bookmark-Page
# GNU General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
# SPDX-License-Identifier: GPL-3.0-or-later

from __future__ import absolute_import, division, print_function
__metaclass__ = type

DOCUMENTATION = r'''
---
module: tag_namespace
short_description: Manage a Bookmark-Page tag namespace
description:
  - Create, update, or delete one tag namespace.
  - The namespace O(name) cannot be changed after it is created.
version_added: "2.0.0"
author:
  - Bookmark-Page (@leeo86)
extends_documentation_fragment:
  - leeo86.bookmarks.bookmarks
options:
  name:
    description:
      - Namespace name. Lowercase letters, digits, underscores, and hyphens.
    type: str
    required: true
  state:
    description:
      - Whether the namespace should exist.
    type: str
    choices: [present, absent]
    default: present
  label:
    description:
      - Label shown in the sidebar. Required when O(state=present).
    type: str
  colour:
    description:
      - Sidebar colour as C(#rrggbb).
    type: str
    default: "#64748b"
  sort:
    description:
      - Sidebar order.
    type: int
    default: 0
  show_in_sidebar:
    description:
      - Show the namespace in the sidebar.
    type: bool
    default: true
'''

EXAMPLES = r'''
- name: Ensure the type namespace
  leeo86.bookmarks.tag_namespace:
    name: type
    label: Type
    colour: "#0f766e"
'''

RETURN = r'''
namespace:
  description: The namespace after the change, when it still exists.
  type: dict
  returned: when state is present and check mode is not used
'''


from ansible.module_utils.basic import AnsibleModule
from ansible_collections.leeo86.bookmarks.plugins.module_utils.bookmarks import (
    api,
    common_argument_spec,
    quote_path,
)


def main():
    spec = common_argument_spec()
    spec.update(
        name=dict(type='str', required=True),
        state=dict(type='str', choices=['present', 'absent'], default='present'),
        label=dict(type='str'),
        colour=dict(type='str', default='#64748b'),
        sort=dict(type='int', default=0),
        show_in_sidebar=dict(type='bool', default=True),
    )
    module = AnsibleModule(
        argument_spec=spec,
        supports_check_mode=True,
        required_if=[('state', 'present', ['label'])],
    )
    name = module.params['name']
    namespaces = api(module, 'GET', '/api/v1/namespaces').get('namespaces') or []
    matches = [item for item in namespaces if item.get('name') == name]
    if len(matches) > 1:
        module.fail_json(msg='More than one namespace is named %s' % name)
    current = matches[0] if matches else None
    if module.params['state'] == 'absent':
        if current is None:
            module.exit_json(changed=False)
        diff = {'before': {'name': name}, 'after': {}}
        if module.check_mode:
            module.exit_json(changed=True, diff=diff)
        api(module, 'DELETE', '/api/v1/namespaces/%s' % quote_path(current['id']))
        module.exit_json(changed=True, diff=diff)
    desired = {
        'label': module.params['label'],
        'colour': module.params['colour'],
        'sort': module.params['sort'],
        'showInSidebar': module.params['show_in_sidebar'],
    }
    before = {}
    if current is not None:
        before = {
            'label': current.get('label'),
            'colour': current.get('colour'),
            'sort': current.get('sort'),
            'showInSidebar': current.get('showInSidebar'),
        }
    diff = {'before': before, 'after': desired}
    if before == desired:
        module.exit_json(changed=False, diff=diff, namespace=current)
    if module.check_mode:
        module.exit_json(changed=True, diff=diff)
    if current is None:
        created = api(module, 'POST', '/api/v1/namespaces', dict(desired, name=name))
        module.exit_json(changed=True, diff=diff, namespace=created)
    updated = api(module, 'PATCH', '/api/v1/namespaces/%s' % quote_path(current['id']), desired)
    module.exit_json(changed=True, diff=diff, namespace=updated)


if __name__ == '__main__':
    main()
