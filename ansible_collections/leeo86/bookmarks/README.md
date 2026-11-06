# leeo86.bookmarks

Ansible collection for a Bookmark-Page V2 server. The modules are GPL-3.0-or-later. The Bookmark-Page application remains MIT.

Install from this repository:

```bash
ansible-galaxy collection install "git+https://github.com/LeeO86/Bookmark-Page.git#/ansible_collections/leeo86/bookmarks,v2.4.0"
```

Every module accepts `api_url`, `api_token`, and `validate_certs`. The URL and token also come from `BOOKMARKS_API_URL` and `BOOKMARKS_API_TOKEN`.

Roles `inventory_sync` and `v1_import` build entries from an Ansible inventory or from a V1 site. See `docs/ansible.md` in the Bookmark-Page repository.

Version 2.3.0 added `entry_favicon` (file, Base64 or module-host URL), image checks,
explicit `secret_value`, and V1 import options for controller image supply, API
delegation, split tag columns, overrides and managed checks. Existing arguments
remain compatible. See the repository [Ansible guide](https://github.com/LeeO86/Bookmark-Page/blob/v2.4.0/docs/ansible.md).

Collection 2.4.0 matches the application release for OIDC sign-in and sidebar facets. Existing module arguments remain unchanged; the new sign-in controls are server environment variables.
