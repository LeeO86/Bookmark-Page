#!/usr/bin/python
# -*- coding: utf-8 -*-

# Copyright (c) Bookmark-Page
# GNU General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
# SPDX-License-Identifier: GPL-3.0-or-later

from __future__ import absolute_import, division, print_function
__metaclass__ = type

DOCUMENTATION = r'''
---
module: site_branding
short_description: Manage the Bookmark-Page site title and claim
description:
  - Update only the supplied title and claim, preserving all other settings.
  - Requires an API token with the admin scope.
  - Supports check mode. At least one branding option must be supplied.
version_added: "2.1.0"
author:
  - Bookmark-Page (@leeo86)
extends_documentation_fragment:
  - leeo86.bookmarks.bookmarks
options:
  site_title:
    description:
      - Site title, trimmed and between 1 and 200 characters.
    type: str
  site_claim:
    description:
      - Site claim, at most 500 characters. An empty string clears it.
    type: str
'''

EXAMPLES = r'''
- name: Set the site title without changing its claim or logo
  leeo86.bookmarks.site_branding:
    site_title: Infrastructure
'''

RETURN = r'''
branding:
  description: The selected title and claim after the change, or the check-mode preview.
  type: dict
  returned: always
'''

from ansible.module_utils.basic import AnsibleModule
from ansible_collections.leeo86.bookmarks.plugins.module_utils.bookmarks import (
    api,
    common_argument_spec,
)


def main():
    spec = common_argument_spec()
    spec.update(site_title=dict(type='str'), site_claim=dict(type='str'))
    module = AnsibleModule(
        argument_spec=spec,
        supports_check_mode=True,
        required_one_of=[['site_title', 'site_claim']],
    )
    desired = {}
    title = module.params['site_title']
    if title is not None:
        title = title.strip()
        if not 1 <= len(title) <= 200:
            module.fail_json(msg='site_title must contain between 1 and 200 characters after trimming')
        desired['siteTitle'] = title
    claim = module.params['site_claim']
    if claim is not None:
        if len(claim) > 500:
            module.fail_json(msg='site_claim must contain at most 500 characters')
        desired['siteClaim'] = claim
    current = api(module, 'GET', '/api/v1/settings')
    before = {key: current.get(key) for key in desired}
    changed = before != desired
    if changed and not module.check_mode:
        api(module, 'PATCH', '/api/v1/settings', desired)
    module.exit_json(changed=changed, diff={'before': before, 'after': desired}, branding=desired)


if __name__ == '__main__':
    main()
