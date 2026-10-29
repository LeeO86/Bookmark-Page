# Copyright (c) Bookmark-Page
# GNU General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
# SPDX-License-Identifier: GPL-3.0-or-later

import unittest
from ansible_collections.leeo86.bookmarks.plugins.module_utils.bookmarks import BookmarkBuildError, v1_plan


class MigrationTests(unittest.TestCase):
    def test_exact_values_and_unnamed_columns(self):
        source = {'bookmarks': {'Control Room': [
            {'id': '1', 'name': 'Device', 'user1': '  pass  ', 'user2': 'unnamed'},
        ]}}
        plan = v1_plan({'nameU1': 'Password'}, source, ['user1'])
        self.assertEqual(plan['entries'][0]['fields'], [
            {'key': 'user1', 'value': '  pass  '},
            {'key': 'user2', 'value': 'unnamed'},
        ])
        self.assertEqual([field['key'] for field in plan['fields']], ['user1', 'user2'])
        self.assertEqual(plan['fields'][1]['label'], 'user2')

    def test_protocols_and_multiple_groups(self):
        for scheme in ('ssh', 'vnc', 'rdp', 'telnet', 'https', 'custom'):
            item = {'id': '1', 'name': 'Device', 'link': scheme + '://user@device.example:22/'}
            plan = v1_plan({}, {'bookmarks': {'A': [item], 'B': [item]}}, [])
            entry = plan['entries'][0]
            self.assertEqual(len(plan['entries']), 1)
            self.assertEqual(entry['host'], 'device.example')
            expected = 'web' if scheme == 'https' else 'other' if scheme == 'custom' else scheme
            self.assertEqual(entry['links'][0]['type'], expected)
            self.assertEqual(entry['tags'], ['group:A', 'group:B'])

    def test_duplicate_groups_fill_missing_fields_and_reject_conflicts(self):
        first = {'id': '1', 'name': 'Device', 'user1': ''}
        second = {'id': '1', 'name': 'Device', 'user1': ' preserved '}
        source = {'bookmarks': {'A': [first], 'B': [second]}}
        plan = v1_plan({}, source, ['user1'])
        self.assertEqual(plan['entries'][0]['fields'], [{'key': 'user1', 'value': ' preserved '}])
        first['user1'] = 'different'
        with self.assertRaises(BookmarkBuildError):
            v1_plan({}, source, ['user1'])
