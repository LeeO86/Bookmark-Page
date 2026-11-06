# Ansible

The `leeo86.bookmarks` collection manages a Bookmark-Page V2 server. It lives at `ansible_collections/leeo86/bookmarks`, version 2.4.2, and needs ansible-core 2.16 or newer. The modules are GPL-3.0-or-later because they import Ansible. The application outside the collection remains MIT.

## Install

```bash
ansible-galaxy collection install "git+https://github.com/LeeO86/Bookmark-Page.git#/ansible_collections/leeo86/bookmarks,v2.4.2"
```

From a git checkout, set `ANSIBLE_COLLECTIONS_PATH` to the repository root so Ansible finds `leeo86.bookmarks` without installing it.

## Connection

Every module takes `api_url`, `api_token`, and `validate_certs`. The URL and token also come from `BOOKMARKS_API_URL` and `BOOKMARKS_API_TOKEN`. The token is redacted in Ansible output. The server does not read those variables.

`entry`, `entries_sync` and `entry_favicon` need `write`; `entry_info` needs `read`. Namespace, field, filter, action-template and site-branding changes need `admin`. An admin token covers both.

## Modules

| Module             | Purpose                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `entry`            | One entry addressed by `scope` and `external_key`. A tag is a string, or a mapping with `tag` and an optional display `label`. |
| `entries_sync`     | Full list for a scope, with optional `purge`                                                                                   |
| `entry_favicon`    | Supply/cache a favicon from a module-host file, Base64 or URL                                                                  |
| `entry_info`       | Query entries with the portal query language                                                                                   |
| `tag_namespace`    | One tag namespace                                                                                                              |
| `field_definition` | One custom field                                                                                                               |
| `filter`           | One global tab                                                                                                                 |
| `site_branding`    | Selected site title and/or claim; preserves all other settings                                                                 |
| `action_template`  | One action template                                                                                                            |

All of them support check mode and `--diff`, and a second run with the same arguments reports `changed: false`.

`entries_sync` check mode calls `POST /api/v1/scopes/{scope}/sync` with `dryRun: true`. That comparison includes secret values. The `entry` module compares the entry the API returns. Secret values are masked there, so its check mode does not detect a new secret. `state: absent` deletes that one scope entry. The generic entry delete refuses an entry the scope still owns.

A bare icon name such as `camera` is stored as `lucide:camera`. A value that already contains a colon is stored unchanged. An empty icon clears the reference.

`favicon_url` sets an explicit HTTP(S) image URL or a path relative to the primary HTTP(S) link, optionally using the entry's `{{host}}`. An empty string restores discovery. A library/upload icon still takes priority. This attribute is owned and compared like `icon`, including check mode. The override, tag-column and branding import options require application and collection version `2.1.0` or newer.

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
| `v1_import_site_title`    | `false`     | Copy V1 `name` to the V2 site title                                                      |
| `v1_import_site_claim`    | `false`     | Copy V1 `claim` to the V2 site claim                                                     |
| `v1_group_namespace`      | `group`     | Namespace for V1 groups                                                                  |
| `v1_group_label`          | `Group`     | Sidebar label for that namespace                                                         |
| `v1_validate_certs`       | `true`      | Verify the V1 TLS certificate                                                            |

V1 groups become tags `group:<name>`. A bookmark that is in several groups becomes one entry. The external key is the V1 id. The first copy supplies the name, description, link, and fields, and later groups only add tags. V1 remarks become the description. The V1 link becomes one primary link labelled `Open`. The hostname of an `http` or `https` link becomes `host`. V1 sort order is kept.

`nameU1`–`nameU8` become field labels. `hideU1`–`hideU8` set to `1` hides that column. Populated or explicitly secret columns without a label use their `userN` key as the label. Imported fields are visible to viewers. Non-secret fields are searchable. Secret fields are not. Empty values are omitted.

For a hidden column used as tags in V1, set `v1_import_tag_fields: {user3: category}`. A non-empty trimmed cell becomes one `category:<value>` tag, without splitting spaces or punctuation. The column is omitted from custom fields; other columns keep their original meaning. Hidden columns are never guessed to be tags, and a secret/tag overlap is rejected. Duplicate bookmark copies merge these tags. Reimporting replaces previously managed field values with tags and is idempotent. Global field definitions remain available.

Legacy `img/icons/<name>.svg` becomes the Lucide icon `<name>`. Other HTTP(S) favicon URLs are preserved in `favicon_url`, with relative paths resolved against `v1_url`. External device icon paths stay URLs. V1 group remarks are not imported. See `docs/migration-v1.md` for editor examples.

`v1_import_site_title` and `v1_import_site_claim` opt in independently. Missing V1 keys leave the corresponding V2 value unchanged. An explicitly empty claim clears it; a selected title must be non-empty after trimming (maximum 200 characters), and claims allow up to 500 characters. Invalid selected values fail before entry changes. Logo, colours, themes and visibility settings are preserved. Both options support check mode and repeated imports are unchanged.

`v1_sync` is the `entries_sync` result. `v1_branding` is the separate branding result (`changed: false`/skipped when no branding is selected).

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

## Automation additions in 2.2.1

All existing arguments remain supported. Connection options are `api_url`,
`api_token`, `username`, `password`, and `validate_certs`. Their environment
fallbacks are `BOOKMARKS_API_URL`, `BOOKMARKS_API_TOKEN`, `BOOKMARKS_USERNAME`, and
`BOOKMARKS_PASSWORD`. A token takes precedence. Without one, both credentials are
required; the module logs in, retains the session cookie within the task, and
sends the matching Origin header. Passwords and tokens are redacted. Local-login
and break-glass restrictions still apply. Each task may log in separately, so a
persistent automation token is preferable for frequent syncs.

Use the server's `ADMIN_API_TOKEN`/`ADMIN_API_TOKEN_FILE` for unattended bootstrap,
or create a normal API token once without `expiresAt`. Neither needs a new token
on every playbook run. Admin scope is required for settings, icons and global tabs.
Check mode leaves managed resources unchanged; authentication can still record
logins and token `lastUsedAt`.

| Module                  | Added behavior                                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `settings`              | Every settings PATCH option, plus `logo_src` and `tab_icon_src`                                                        |
| `icon`                  | Exact name, `src` or Base64 `content`, inferred `content_type`, `state: present/absent`; returns stable `id` and `ref` |
| `filters_sync`          | Global tabs keyed by scope and `external_key`, with scope-limited purge                                                |
| `entry`, `entries_sync` | Entry/link icons accept `upload-name:<exact-name>`; both accept tag strings or `{tag, label}`                          |
| `filter`                | Optional `view_mode`; omission preserves an existing layout                                                            |
| `site_branding`         | Existing title/claim behavior retained                                                                                 |

All modules belong to the `bookmarks` action group:

```yaml
- hosts: localhost
  gather_facts: false
  module_defaults:
    group/leeo86.bookmarks.bookmarks:
      api_url: https://bookmarks.example.com
      api_token: '{{ vault_bookmarks_token }}'
      validate_certs: true
  tasks:
    - name: Configure the portal
      leeo86.bookmarks.settings:
        site_title: MXL platform
        site_claim: Production tools
        accent_preset: custom
        accent_colour: '#2563eb'
        favicon_colour: '#2563eb'
        all_tab_public: true
        shared_tabs_public_by_default: true
        logo_src: /srv/branding/logo.svg
        tab_icon_src: /srv/branding/tab.png
    - name: Install a custom mixer icon
      leeo86.bookmarks.icon:
        name: mxl-mixer
        src: /srv/icons/mixer.svg
    - name: Synchronise shared views
      leeo86.bookmarks.filters_sync:
        scope: mxl
        purge: true
        filters:
          - external_key: production
            name: Production
            query: production:*
            icon: camera
            group_by: production
            sort: 10
            view_mode: cards
            columns: [name, host]
            is_public: true
    - name: Synchronise entries
      leeo86.bookmarks.entries_sync:
        scope: mxl
        entries:
          - external_key: mixer
            name: Audio mixer
            icon: upload-name:mxl-mixer
            tags:
              - tag: production:demo
                label: Demonstration production
```

`settings` supports `site_title`, `site_claim`, `accent_preset`, `accent_colour`,
`favicon_colour`, `neutral_palette`, `default_colour_mode`, `background`,
`all_tab_public`, `shared_tabs_public_by_default`, `client_checks_anonymous`, `browser_favicons`,
`favicon_tls_verify`, `favicon_refresh_days`, `audit_retention_days`, and
`default_scope_edit_mode`. Only supplied keys change; colours compare without
case sensitivity. A custom accent requires `accent_preset: custom` if a named
preset is active. Selecting a named preset applies its canonical colour.
Explicit `false`, `0`, and an empty claim retain their meanings.

Image paths refer to the module execution host. An empty `logo_src` or
`tab_icon_src` removes that custom image. SVG logo/icon comparisons use hashes
of sanitised content, so removing an event handler during upload does not cause
perpetual changes. Image diffs show metadata/hashes, not Base64. `icon` replaces
bytes at the existing ID and refreshes the versioned image URL. Deleting an icon
leaves its references in place; those entries use their fallback until the
reference is cleared or replaced. No unrelated icons are garbage-collected.

`filters_sync` never adopts a manual tab by name. Migrate existing automated
manual tabs explicitly: create the scope-owned replacements, verify them, then
remove only the old tabs you know automation created. The legacy `filter` module
continues to manage unowned global tabs. Personal tabs and other scopes are never
purged. Omitting `is_public` preserves existing visibility and uses the configured
shared-tab default only on creation. Explicit `false` wins.

Tag labels are global for a `namespace:value` token. An omitted label preserves
it; an explicit `null` clears it. Conflicting explicit labels within one
`entries_sync` request reject the entire batch before mutation. Omitted labels
and one consistent explicit label may coexist. Separate syncs/scopes can update
the same global label; coordinate its ownership in your inventory rather than
assigning competing descriptions.

When switching from uploaded workaround icons to automatic discovery, explicitly
clear the previously managed override with `icon: ''`. Omitting the argument
preserves it. `favicon_url` also accepts validated inline image data in 2.2.1.

## Device reachability additions (2.3.0)

| Module/option               | Purpose                                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `entry_favicon`             | Supply an existing entry's favicon by `id` or `scope` + `external_key`; choose exactly one of `src`, Base64 `content`, or `url` |
| `settings.browser_favicons` | Optional browser-direct display fallback, false by default                                                                      |
| `checks[].kind: image`      | Browser image load or server image validation, with optional GET `request_spec`                                                 |
| `fields[].secret_value`     | Explicit secret alternative to the compatible `value`; exactly one must be set                                                  |

`entry_favicon` downloads `url` on the host where its module executes; `src` is
also local to that host. It supports `content_type` inference, `validate_certs`,
`timeout` (5 seconds), `max_bytes` (524288), check mode and hash-only diffs. The
portal preview computes the **sanitised** hash, so a repeated SVG with stripped
attributes is unchanged. First supply pins the image even if the fetched bytes
were identical; it does not change `icon`. All 12 modules belong to
`group/leeo86.bookmarks.bookmarks`, including this module.

```yaml
- name: Supply a device image from the reachable API host
  leeo86.bookmarks.entry_favicon:
    scope: devices
    external_key: mixer
    url: http://device.example/vendor/icon.ico
    validate_certs: true
  delegate_to: portal_host
```

The V1 role additionally supports:

| Variable                           | Default     | Meaning                                                                           |
| ---------------------------------- | ----------- | --------------------------------------------------------------------------------- |
| `v1_import_field_min_roles`        | `{}`        | Minimum role per imported user1..user8 field; omitted columns remain viewer       |
| `v1_import_favicon_use_proxy`      | `true`      | Respect controller proxy settings for favicon downloads; false bypasses proxies   |
| `v1_import_supply_favicons`        | `false`     | Download effective V1 favicon URLs on the controller and supply successful images |
| `v1_import_favicon_validate_certs` | `true`      | Verify controller image-download certificates                                     |
| `v1_import_favicon_timeout`        | `5`         | Download timeout in seconds                                                       |
| `v1_import_favicon_max_bytes`      | `524288`    | Controller image-size limit; server limit also applies                            |
| `v1_import_favicon_overrides`      | `{}`        | V1 id to replacement HTTP(S) URL, or empty string for discovery                   |
| `v1_import_checks`                 | `[]`        | Managed check definitions for each imported entry with a host                     |
| `v1_import_favicon_checks`         | `false`     | Add a managed client image check for each effective V1 favicon URL                |
| `v1_import_api_delegate_to`        | `localhost` | Inventory host that executes API modules; controller downloads stay local         |

Tag mappings retain `user3: room`, or accept
`user3: {namespace: '', split: ','}`. Omitting `split` retains the entire cell.
`v1_sync` is the scope result; `v1_favicons` reports download failures and upload
hashes. Image failures do not abort the role. See [migration](migration-v1.md#restricted-device-networks-230)
for delegation, check-mode prerequisites, managed removal and TLS separation.
Ordinary known public field values are released from result masking after a
successful metadata lookup; legacy secret and unknown values stay redacted.

## Device favicon transport and proxies (2.4.2)

`leeo86.bookmarks.favicon_image` and `entry_favicon` URL downloads send
`Accept: image/webp,image/png,image/svg+xml,image/x-icon,image/jpeg,image/gif,image/*,*/*;q=0.8`.
They decode gzip/deflate even when a device compresses without negotiation.
`max_bytes` limits both downloaded bytes and each decoded layer; malformed,
truncated, unsupported encodings and oversized images are reported as failures.
The lookup returns `ok: false`, so an import can report the failure and continue.
TLS verification and existing timeout/redirect limits still apply.

Both accept `use_proxy: true` by default. Set it to `false` for direct image
requests from a reachable controller/execution host; the V1 role exposes
`v1_import_favicon_use_proxy: false`. The V1-role flag controls only controller image downloads. In the direct
`entry_favicon` module, Ansible also applies `use_proxy` to portal API calls;
neither option alters the execution host's proxy environment. Python urllib `no_proxy` matches hostname suffixes; CIDRs
such as `10.0.0.0/8` and IP-prefix shortcuts such as `10.` do not bypass proxies.
Use explicit host/suffix exclusions or disable image proxy use for that task.
See [Python ProxyHandler](https://docs.python.org/3/library/urllib.request.html#urllib.request.ProxyHandler).

```yaml
- name: Supply a directly reachable device image
  leeo86.bookmarks.entry_favicon:
    scope: devices
    external_key: camera
    url: http://device.example/icon.ico
    use_proxy: false
```

V1 imports omit all automatically added checks for loopback entry hosts
(`localhost`, numeric 127/8 and `::1`, including equivalent numeric forms).
The entry/link and optional supplied image are still imported. Per-column
`v1_import_field_min_roles`, for example `{user8: editor}`, controls imported
field definitions; omitted columns retain `viewer`. Allowed values are
`anonymous`, `viewer`, `editor` and `admin`. The secret-column selection remains
independent. See [migration options](migration-v1.md).
