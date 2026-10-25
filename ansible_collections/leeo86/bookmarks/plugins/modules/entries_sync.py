#!/usr/bin/python
# -*- coding: utf-8 -*-

# Copyright (c) Bookmark-Page
# GNU General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
# SPDX-License-Identifier: GPL-3.0-or-later

from __future__ import absolute_import, division, print_function
__metaclass__ = type

DOCUMENTATION = r'''
---
module: entries_sync
short_description: Replace the managed entries in one Ansible scope
description:
  - Send the full desired list for one scope.
  - O(purge) removes managed entries in that scope that are not in the list.
  - Check mode calls the same API with a dry run.
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
  purge:
    description:
      - Remove scope entries whose external key is not in O(entries).
    type: bool
    default: false
  entries:
    description:
      - Desired entries. The shape matches M(leeo86.bookmarks.entry).
    type: list
    elements: dict
    required: true
    suboptions:
      external_key:
        description:
          - Stable key for this entry inside the scope.
        type: str
        required: true
      name:
        description:
          - Entry name.
        type: str
        required: true
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
        type: str
      sort:
        description:
          - Manual sort order.
        type: int
      tags:
        description:
          - Tag strings such as C(type:audio).
        type: list
        elements: str
      links:
        description:
          - Links that belong to the entry.
        type: list
        elements: dict
        suboptions:
          label:
            description:
              - Link label.
            type: str
            required: true
          url_template:
            description:
              - URL template.
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
  - Check mode uses the server dry run, including secret field values.
'''

EXAMPLES = r'''
- name: Sync two studio entries and remove anything else in the scope
  leeo86.bookmarks.entries_sync:
    scope: studio
    purge: true
    entries:
      - external_key: mixer-1
        name: Mixer
        host: 10.0.0.8
'''

RETURN = r'''
created:
  description: Entries the server created.
  type: list
  elements: dict
  returned: always
updated:
  description: Entries the server updated.
  type: list
  elements: dict
  returned: always
deleted:
  description: Entries the server deleted.
  type: list
  elements: dict
  returned: always
unchanged:
  description: Entries that already matched.
  type: list
  elements: dict
  returned: always
'''


from ansible.module_utils.basic import AnsibleModule
from ansible_collections.leeo86.bookmarks.plugins.module_utils.bookmarks import (
    BookmarkBuildError,
    api,
    build_entries,
    common_argument_spec,
    entry_argument_spec,
    quote_path,
)


def main():
    entry_options = entry_argument_spec()
    entry_options['name'] = dict(type='str', required=True)
    spec = common_argument_spec()
    spec.update(
        scope=dict(type='str', required=True),
        purge=dict(type='bool', default=False),
        entries=dict(type='list', elements='dict', required=True, options=entry_options),
    )
    module = AnsibleModule(argument_spec=spec, supports_check_mode=True)
    try:
        entries = build_entries(module.params['entries'])
    except BookmarkBuildError as error:
        module.fail_json(msg=str(error))
    result = api(
        module,
        'POST',
        '/api/v1/scopes/%s/sync' % quote_path(module.params['scope']),
        {
            'entries': entries,
            'purge': bool(module.params['purge']),
            'dryRun': module.check_mode,
        },
    )
    created = result.get('created') or []
    updated = result.get('updated') or []
    deleted = result.get('deleted') or []
    unchanged = result.get('unchanged') or []
    module.exit_json(
        changed=bool(created or updated or deleted),
        created=created,
        updated=updated,
        deleted=deleted,
        unchanged=unchanged,
        diff={
            'before': {},
            'after': {
                'created': [item.get('externalKey') for item in created],
                'updated': [item.get('externalKey') for item in updated],
                'deleted': [item.get('externalKey') for item in deleted],
            },
        },
    )


if __name__ == '__main__':
    main()
