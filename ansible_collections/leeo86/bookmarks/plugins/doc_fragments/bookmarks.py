# -*- coding: utf-8 -*-

# Copyright (c) Bookmark-Page
# GNU General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
# SPDX-License-Identifier: GPL-3.0-or-later

from __future__ import absolute_import, division, print_function
__metaclass__ = type


class ModuleDocFragment(object):
    DOCUMENTATION = r'''
options:
  api_url:
    description:
      - Base URL of the Bookmark-Page server.
      - A trailing slash is optional.
      - Falls back to the C(BOOKMARKS_API_URL) environment variable.
    type: str
    required: true
  api_token:
    description:
      - API token with the scopes the task needs.
      - Entry and sync tasks need C(write). Catalog tasks need C(admin).
      - Falls back to the C(BOOKMARKS_API_TOKEN) environment variable.
      - Ansible redacts this value in output.
    type: str
    required: true
  validate_certs:
    description:
      - Verify the server TLS certificate.
    type: bool
    default: true
'''
