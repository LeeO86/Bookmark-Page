# -*- coding: utf-8 -*-

# Copyright (c) Bookmark-Page
# GNU General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
# SPDX-License-Identifier: GPL-3.0-or-later

from __future__ import absolute_import, division, print_function
__metaclass__ = type

from ansible.errors import AnsibleFilterError
from ansible_collections.leeo86.bookmarks.plugins.module_utils.bookmarks import (
    BookmarkBuildError,
    inventory_entry,
    v1_plan,
)


def bookmark_inventory_entry(host, include, exclude, namespace, mapping=None):
    """Build one entries_sync item from a host's variables."""
    try:
        return inventory_entry(host, include, exclude, namespace, mapping or {})
    except BookmarkBuildError as error:
        raise AnsibleFilterError(str(error)) from error


def v1_import_plan(settings, bookmarks, secret_fields, namespace='group', tag_fields=None, v1_url=''):
    """Build field definitions and entries from a V1 JSON export."""
    try:
        return v1_plan(settings, bookmarks, secret_fields, namespace, tag_fields, v1_url)
    except BookmarkBuildError as error:
        raise AnsibleFilterError(str(error)) from error


class FilterModule:
    """Filters used by the inventory_sync and v1_import roles."""

    def filters(self):
        return {
            'bookmark_inventory_entry': bookmark_inventory_entry,
            'v1_import_plan': v1_import_plan,
        }
