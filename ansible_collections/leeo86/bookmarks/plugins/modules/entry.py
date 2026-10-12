#!/usr/bin/python
# -*- coding: utf-8 -*-

# Copyright (c) Bookmark-Page
# GNU General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
# SPDX-License-Identifier: GPL-3.0-or-later

from __future__ import absolute_import, division, print_function
__metaclass__ = type

DOCUMENTATION = r'''
---
module: entry
short_description: Manage one Bookmark-Page entry by external key
description:
  - Create, update, or delete one entry inside an Ansible scope.
  - The entry is identified by O(scope) and O(external_key).
version_added: "2.0.0"
author:
  - Bookmark-Page (@leeo86)
extends_documentation_fragment:
  - leeo86.bookmarks.bookmarks
options:
  scope:
    description:
      - Ansible scope name.
    type: str
    required: true
  external_key:
    description:
      - Stable key for this entry inside the scope.
    type: str
    required: true
  state:
    description:
      - Whether the entry should exist.
    type: str
    choices: [present, absent]
    default: present
  name:
    description:
      - Entry name. Required when O(state=present).
    type: str
  description:
    description:
      - Entry description.
    type: str
  host:
    description:
      - Hostname or IP address.
    type: str
  icon:
    description:
      - Icon reference. A bare name selects a Lucide icon.
      - Values that already contain a colon are stored unchanged.
    type: str
  sort:
    description:
      - Manual sort order.
    type: int
  tags:
    description:
      - Tag strings such as C(type:audio) or a plain value.
    type: list
    elements: str
  links:
    description:
      - Links that belong to the entry.
      - Exactly one link is primary. The first link is primary when none is marked.
    type: list
    elements: dict
    suboptions:
      label:
        description:
          - Link label. It is unique within the entry.
        type: str
        required: true
      url_template:
        description:
          - URL template. Placeholders such as C({{host}}) are allowed.
        type: str
        required: true
      type:
        description:
          - Link type.
        type: str
        choices: [web, api, ssh, vnc, rdp, telnet, other]
        default: web
      primary:
        description:
          - Whether this is the primary link.
        type: bool
        default: false
      sort:
        description:
          - Link order.
        type: int
        default: 0
      icon:
        description:
          - Optional icon reference.
        type: str
  fields:
    description:
      - Custom field values. The field definition must already exist.
    type: list
    elements: dict
    suboptions:
      key:
        description:
          - Field key.
        type: str
        required: true
      value:
            description:
              - Field value. Ansible redacts it in logs.
            type: str
            required: true
  checks:
    description:
      - Online checks stored on the entry.
    type: list
    elements: dict
    suboptions:
      name:
        description:
          - Check name.
        type: str
        required: true
      kind:
        description:
          - Check kind.
        type: str
        required: true
        choices: [icmp, tcp, http]
      executor:
        description:
          - Where the check runs.
        type: str
        choices: [server, client]
        default: server
      interval_seconds:
        description:
          - Seconds between checks.
        type: int
        default: 60
      timeout_ms:
        description:
          - Check timeout in milliseconds.
        type: int
        default: 5000
      tls_verify:
        description:
          - Verify TLS certificates for an HTTP check.
        type: bool
        default: false
      host:
        description:
          - Optional host override.
        type: str
      port:
        description:
          - TCP port. Required for TCP checks.
        type: int
      link_label:
        description:
          - Label of a link this check belongs to.
        type: str
      method:
        description:
          - HTTP method for an HTTP check.
        type: str
        default: GET
      url_template:
        description:
          - URL template for an HTTP check.
        type: str
notes:
  - The server calls HTTP check URLs. Only a token that is allowed to write entries should use this module.
  - Check mode compares the visible entry. A masked secret field is treated as unchanged, so check mode does not detect a new secret value.
  - O(external_key) and field keys are identifiers. Ansible's secret-name check is disabled for them with C(no_log=false).
'''

EXAMPLES = r'''
- name: Ensure a mixer entry
  leeo86.bookmarks.entry:
    scope: studio
    external_key: mixer-1
    name: Mixer
    host: 10.0.0.8
    tags:
      - type:audio
    links:
      - label: Admin
        url_template: "https://{{ host }}/"
        primary: true
'''

RETURN = r'''
entry:
  description: The entry after the change, when it still exists.
  type: dict
  returned: when state is present
status:
  description: API status for a present entry, such as created, updated, or unchanged.
  type: str
  returned: when state is present and check mode is not used
'''

from ansible.module_utils.basic import AnsibleModule
from ansible_collections.leeo86.bookmarks.plugins.module_utils.bookmarks import (
    BookmarkBuildError,
    api,
    build_entry,
    check_spec,
    common_argument_spec,
    entry_matches,
    field_value_spec,
    find_managed,
    link_spec,
    quote_path,
)


def main():
    spec = common_argument_spec()
    spec.update(
        scope=dict(type='str', required=True),
        state=dict(type='str', choices=['present', 'absent'], default='present'),
        external_key=dict(type='str', required=True, no_log=False),
        name=dict(type='str'),
        description=dict(type='str'),
        host=dict(type='str'),
        icon=dict(type='str'),
        sort=dict(type='int'),
        tags=dict(type='list', elements='str'),
        links=link_spec(),
        fields=field_value_spec(),
        checks=check_spec(),
    )
    module = AnsibleModule(
        argument_spec=spec,
        supports_check_mode=True,
        required_if=[('state', 'present', ['name'])],
    )
    scope = module.params['scope']
    external_key = module.params['external_key']
    current = find_managed(module, scope, external_key)
    if module.params['state'] == 'absent':
        if current is None:
            module.exit_json(changed=False)
        if module.check_mode:
            module.exit_json(changed=True, diff={'before': {'name': current.get('name')}, 'after': {}})
        api(
            module,
            'DELETE',
            '/api/v1/scopes/%s/entries/%s' % (quote_path(scope), quote_path(external_key)),
        )
        module.exit_json(changed=True, diff={'before': {'name': current.get('name')}, 'after': {}})

    try:
        desired = build_entry(module.params)
    except BookmarkBuildError as error:
        module.fail_json(msg=str(error))
    changed = current is None or not entry_matches(current, desired)
    diff = {'before': {'name': None if current is None else current.get('name')}, 'after': {'name': desired.get('name')}}
    if module.check_mode or not changed:
        module.exit_json(changed=changed, diff=diff, entry=current)
    result = api(
        module,
        'PUT',
        '/api/v1/scopes/%s/entries/%s' % (quote_path(scope), quote_path(external_key)),
        desired,
    )
    module.exit_json(changed=result.get('status') != 'unchanged', status=result.get('status'), diff=diff, external_key=external_key)


if __name__ == '__main__':
    main()
