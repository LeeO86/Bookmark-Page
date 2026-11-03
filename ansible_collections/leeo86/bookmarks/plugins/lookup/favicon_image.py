# -*- coding: utf-8 -*-
# Copyright (c) Bookmark-Page
# GNU General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
# SPDX-License-Identifier: GPL-3.0-or-later
from __future__ import absolute_import, division, print_function
__metaclass__ = type

DOCUMENTATION = r'''
---
name: favicon_image
short_description: Download a bounded favicon on the controller
version_added: 2.3.0
author:
- Bookmark-Page (@leeo86)
description:
- Downloads configured URLs on the Ansible controller and returns Base64 image data.
- Returns an error result for unavailable images so V1 migrations can continue.
options:
  _terms:
    description: [HTTP(S) image URLs.]
    required: true
    type: list
    elements: str
  validate_certs:
    description: [Verify target TLS certificates.]
    type: bool
    default: true
  timeout:
    description: [Request timeout in seconds.]
    type: int
    default: 5
  max_bytes:
    description: [Maximum image size.]
    type: int
    default: 524288
'''
EXAMPLES = r'''
- name: Fetch an image on the controller
  ansible.builtin.set_fact:
    image: "{{ query('leeo86.bookmarks.favicon_image', 'https://device.example/icon.svg') | first }}"
  no_log: true
'''
RETURN = r'''
_raw:
  description: Image payloads or error objects with an ok flag.
  type: list
  elements: dict
'''
from ansible.plugins.lookup import LookupBase
from ansible_collections.leeo86.bookmarks.plugins.module_utils.favicon import FaviconError, image_data


class LookupModule(LookupBase):
    def run(self, terms, variables=None, **kwargs):
        self.set_options(var_options=variables, direct=kwargs)
        results = []
        for url in terms:
            try:
                payload = image_data(url=url, validate_certs=self.get_option('validate_certs'),
                                     timeout=self.get_option('timeout'), max_bytes=self.get_option('max_bytes'))
                results.append(dict(payload, ok=True))
            except FaviconError as error:
                results.append(dict(ok=False, error=str(error)))
        return results
