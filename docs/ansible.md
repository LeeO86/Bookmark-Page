# Ansible

The `leeo86.bookmarks` collection manages a Bookmark-Page V2 server. It lives at `ansible_collections/leeo86/bookmarks`, version 2.0.0, and needs ansible-core 2.16 or newer. The modules are GPL-3.0-or-later because they import Ansible. The application outside the collection remains MIT.

## Install

```bash
ansible-galaxy collection install "git+https://github.com/LeeO86/Bookmark-Page.git#/ansible_collections/leeo86/bookmarks,v2.0.0"
```

From a git checkout, set `ANSIBLE_COLLECTIONS_PATH` to the repository root so Ansible finds `leeo86.bookmarks` without installing it.

## Connection

Every module takes `api_url`, `api_token`, and `validate_certs`. The URL and token also come from `BOOKMARKS_API_URL` and `BOOKMARKS_API_TOKEN`. The token is redacted in Ansible output. The server does not read those variables.

`entry`, `entries_sync`, and `entry_info` need a token with the `write` scope. Namespace, field, filter, and action-template changes need `admin`. An admin token covers both.

## Modules

| Module             | Purpose                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `entry`            | One entry addressed by `scope` and `external_key`. A tag is a string, or a mapping with `tag` and an optional display `label`. |
| `entries_sync`     | Full list for a scope, with optional `purge`                                                                                   |
| `entry_info`       | Query entries with the portal query language                                                                                   |
| `tag_namespace`    | One tag namespace                                                                                                              |
| `field_definition` | One custom field                                                                                                               |
| `filter`           | One global tab                                                                                                                 |
| `action_template`  | One action template                                                                                                            |

All of them support check mode and `--diff`, and a second run with the same arguments reports `changed: false`.

`entries_sync` check mode calls `POST /api/v1/scopes/{scope}/sync` with `dryRun: true`. That comparison includes secret values. The `entry` module compares the entry the API returns. Secret values are masked there, so its check mode does not detect a new secret. `state: absent` deletes that one scope entry. The generic entry delete refuses an entry the scope still owns.

A bare icon name such as `camera` is stored as `lucide:camera`. A value that already contains a colon is stored unchanged. An empty icon clears the reference.

`favicon_url` sets an explicit HTTP(S) image URL or a path relative to the primary HTTP(S) link, optionally using the entry's `{{host}}`. An empty string restores discovery. A library/upload icon still takes priority. This attribute is owned and compared like `icon`, including check mode. The override and tag-column import options below require application and collection versions newer than `v2.0.0`.

Links need one primary link. When none is marked, the first link becomes primary.

Sync updates the attributes in the payload and leaves other tags, links, fields, checks, and actions in place. `purge` removes only entries of that scope. New scopes use the server's default edit mode, which is `field_ownership`: the automation owns the attributes it sends, and people can add more.

## inventory_sync

The role builds entries from an inventory group and syncs them with purge. It runs on localhost once, even when the play targets other hosts.

| Variable                    | Default           | Meaning                                     |
| --------------------------- | ----------------- | ------------------------------------------- |
| `bookmark_scope`            | `inventory`       | Scope name                                  |
| `bookmark_inventory_group`  | `all`             | Inventory group to read                     |
| `bookmark_purge`            | `true`            | Delete scope entries missing from the group |
| `bookmark_tag_namespace`    | `group`           | Namespace for groups that are not mapped    |
| `bookmark_group_namespaces` | `{}`              | Map an inventory group to a tag namespace   |
| `bookmark_group_include`    | `.*`              | Python regular expression of groups to keep |
| `bookmark_group_exclude`    | all and ungrouped | Python regular expression of groups to skip |

Each host becomes one entry. `external_key` is `inventory_hostname`. `host` is `ansible_host` when it is set, otherwise the inventory hostname. `bookmark_name` and `bookmark_description` override the name and description. `bookmark_icon`, `bookmark_favicon_url` and `bookmark_sort` are optional.

`bookmark_links` is a list of `label`, `url_template`, `type`, `primary`, `sort`, and `icon`. `bookmark_fields` is a dictionary of field key to value, or a list of `key` and `value`. `bookmark_checks` is a list of checks using the `entry` module's check fields.

To store the portal placeholder `{{host}}` in a URL, escape it so Ansible does not template it:

```yaml
url_template: "https://{{ '{{host}}' }}/"
```

The role uses the `leeo86.bookmarks.bookmark_inventory_entry` filter. `bookmark_sync` is the `entries_sync` result.

## v1_import

The role reads `<v1_url>/php/getGlobal.php` and `<v1_url>/php/getBookmarks.php`. It does not open MySQL. It creates the group namespace and the `user1`–`user8` field definitions, then syncs the entries.

| Variable                  | Default     | Meaning                                                                                  |
| ------------------------- | ----------- | ---------------------------------------------------------------------------------------- |
| `v1_url`                  | none        | V1 base URL                                                                              |
| `v1_scope`                | `v1-import` | Scope that owns the imported entries                                                     |
| `v1_purge`                | `true`      | Delete imported entries that are gone from V1                                            |
| `v1_import_secret_fields` | `[]`        | V1 columns to store as secret fields, such as `user2`                                    |
| `v1_import_tag_fields`    | `{}`        | Map chosen `user1`–`user8` columns to tag namespaces; empty namespace creates plain tags |
| `v1_group_namespace`      | `group`     | Namespace for V1 groups                                                                  |
| `v1_group_label`          | `Group`     | Sidebar label for that namespace                                                         |
| `v1_validate_certs`       | `true`      | Verify the V1 TLS certificate                                                            |

V1 groups become tags `group:<name>`. A bookmark that is in several groups becomes one entry. The external key is the V1 id. The first copy supplies the name, description, link, and fields, and later groups only add tags. V1 remarks become the description. The V1 link becomes one primary link labelled `Open`. The hostname of an `http` or `https` link becomes `host`. V1 sort order is kept.

`nameU1`–`nameU8` become field labels. `hideU1`–`hideU8` set to `1` hides that column. Populated or explicitly secret columns without a label use their `userN` key as the label. Imported fields are visible to viewers. Non-secret fields are searchable. Secret fields are not. Empty values are omitted.

For a hidden column used as tags in V1, set `v1_import_tag_fields: {user3: category}`. A non-empty trimmed cell becomes one `category:<value>` tag, without splitting spaces or punctuation. The column is omitted from custom fields; other columns keep their original meaning. Hidden columns are never guessed to be tags, and a secret/tag overlap is rejected. Duplicate bookmark copies merge these tags. Reimporting replaces previously managed field values with tags and is idempotent. Global field definitions remain available.

Legacy `img/icons/<name>.svg` becomes the Lucide icon `<name>`. Other HTTP(S) favicon URLs are preserved in `favicon_url`, with relative paths resolved against `v1_url`. External device icon paths stay URLs. V1 group remarks are not imported. See `docs/migration-v1.md` for editor examples.

`v1_sync` is the `entries_sync` result.

## Examples

`ansible_collections/leeo86/bookmarks/examples/site.yml` imports V1 and syncs an inventory group. `examples/inventory.yml` shows host variables. `tests/integration/site.yml` is the CI playbook.

## Tests

```bash
cd ansible_collections/leeo86/bookmarks
ansible-test sanity --local
```

The integration playbook needs a running server, an admin token, and a URL that serves the V1 JSON fixtures:

```bash
API_URL=http://127.0.0.1:3000 API_TOKEN=bp_... V1_URL=http://127.0.0.1:8099 \
  ansible_collections/leeo86/bookmarks/tests/integration/run.sh
```
