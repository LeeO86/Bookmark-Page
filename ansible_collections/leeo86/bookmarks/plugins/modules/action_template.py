#!/usr/bin/python
# -*- coding: utf-8 -*-

# Copyright (c) Bookmark-Page
# GNU General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
# SPDX-License-Identifier: GPL-3.0-or-later

from __future__ import absolute_import, division, print_function
__metaclass__ = type

DOCUMENTATION = r'''
---
module: action_template
short_description: Manage a Bookmark-Page action template
description:
  - Create or delete an action template.
  - A changed template is deleted and created again because the API has no update route.
version_added: "2.0.0"
author:
  - Bookmark-Page (@leeo86)
extends_documentation_fragment:
  - leeo86.bookmarks.bookmarks
options:
  name:
    description:
      - Template name. An entry action with the same name wins.
    type: str
    required: true
  state:
    description:
      - Whether the template should exist.
    type: str
    choices: [present, absent]
    default: present
  query:
    description:
      - Entries that match this query offer the template.
    type: str
    default: ""
  icon:
    description:
      - Icon reference. A bare name selects a Lucide icon.
    type: str
  method:
    description:
      - HTTP method.
    type: str
    default: GET
  url_template:
    description:
      - Request URL template. Required when O(state=present).
    type: str
  body_template:
    description:
      - Optional request body template.
    type: str
  headers:
    description:
      - Request headers.
    type: dict
    default: {}
  tls_verify:
    description:
      - Verify the device TLS certificate.
    type: bool
    default: false
  timeout_ms:
    description:
      - Request timeout in milliseconds.
    type: int
    default: 5000
  expect_status:
    description:
      - Expected status codes. C(2xx) matches every success status.
    type: list
    elements: str
    default:
      - 2xx
  expect_body_contains:
    description:
      - Text that must appear in the body.
    type: str
  expect_body_regex:
    description:
      - Regular expression the body must match.
    type: str
  expect_json_path:
    description:
      - Dot path read from a JSON body before it is compared.
    type: str
  expect_equals:
    description:
      - Exact text the selected body must equal.
    type: str
  confirm:
    description:
      - Ask for confirmation before running.
      - The default is true unless O(method) is GET.
    type: bool
  min_role:
    description:
      - Minimum role that can run the template.
    type: str
    choices: [anonymous, viewer, editor, admin]
    default: editor
  inputs:
    description:
      - Runtime prompts. Use C({{input.name}}) in the request.
    type: list
    elements: dict
    suboptions:
      name:
        description:
          - Prompt name. Lowercase letters, digits, and underscores.
        type: str
        required: true
      label:
        description:
          - Prompt label.
        type: str
        required: true
      type:
        description:
          - Input type.
        type: str
        choices: [text, password, number]
        default: text
      default_value:
        description:
          - Default text. Ansible redacts it in logs.
        type: str
      required:
        description:
          - Whether the operator must fill the prompt.
        type: bool
        default: true
notes:
  - The server calls the device. A template token needs the C(admin) scope.
'''

EXAMPLES = r'''
- name: Offer a health request on audio devices
  leeo86.bookmarks.action_template:
    name: Health
    query: type:audio
    method: GET
    url_template: "http://{{ '{{host}}' }}/health"
    confirm: false
'''

RETURN = r'''
template:
  description: The template after the change, when it still exists.
  type: dict
  returned: when state is present and check mode is not used
'''


from ansible.module_utils.basic import AnsibleModule
from ansible_collections.leeo86.bookmarks.plugins.module_utils.bookmarks import (
    ROLES,
    api,
    build_template,
    common_argument_spec,
    prompt_spec,
    quote_path,
    same_json,
    template_view,
)


def main():
    spec = common_argument_spec()
    spec.update(
        name=dict(type='str', required=True),
        state=dict(type='str', choices=['present', 'absent'], default='present'),
        query=dict(type='str', default=''),
        icon=dict(type='str'),
        method=dict(type='str', default='GET'),
        url_template=dict(type='str'),
        body_template=dict(type='str', no_log=True),
        headers=dict(type='dict', default={}),
        tls_verify=dict(type='bool', default=False),
        timeout_ms=dict(type='int', default=5000),
        expect_status=dict(type='list', elements='str', default=['2xx']),
        expect_body_contains=dict(type='str'),
        expect_body_regex=dict(type='str'),
        expect_json_path=dict(type='str'),
        expect_equals=dict(type='str'),
        confirm=dict(type='bool'),
        min_role=dict(type='str', choices=ROLES, default='editor'),
        inputs=prompt_spec(),
    )
    module = AnsibleModule(
        argument_spec=spec,
        supports_check_mode=True,
        required_if=[('state', 'present', ['url_template'])],
    )
    name = module.params['name']
    templates = api(module, 'GET', '/api/v1/action-templates').get('templates') or []
    matches = [item for item in templates if item.get('name') == name]
    if len(matches) > 1:
        module.fail_json(msg='More than one action template is named %s' % name)
    current = matches[0] if matches else None
    if module.params['state'] == 'absent':
        if current is None:
            module.exit_json(changed=False)
        diff = {'before': {'name': name}, 'after': {}}
        if module.check_mode:
            module.exit_json(changed=True, diff=diff)
        api(module, 'DELETE', '/api/v1/action-templates/%s' % quote_path(current['id']))
        module.exit_json(changed=True, diff=diff)
    desired = build_template(module.params)
    before = template_view(current) if current is not None else {}
    after = template_view(desired)
    diff = {'before': before, 'after': {'name': name, 'query': desired['query']}}
    if current is not None and same_json(before, after):
        module.exit_json(changed=False, diff=diff, template=current)
    if module.check_mode:
        module.exit_json(changed=True, diff=diff)
    if current is not None:
        api(module, 'DELETE', '/api/v1/action-templates/%s' % quote_path(current['id']))
    created = api(module, 'POST', '/api/v1/action-templates', desired)
    module.exit_json(changed=True, diff=diff, template=created)


if __name__ == '__main__':
    main()
