# leeo86.bookmarks

Ansible collection for a Bookmark-Page V2 server. The modules are GPL-3.0-or-later. The Bookmark-Page application remains MIT.

Install from this repository:

```bash
ansible-galaxy collection install "git+https://github.com/LeeO86/Bookmark-Page.git#/ansible_collections/leeo86/bookmarks,v2.1.0"
```

Every module accepts `api_url`, `api_token`, and `validate_certs`. The URL and token also come from `BOOKMARKS_API_URL` and `BOOKMARKS_API_TOKEN`.

Roles `inventory_sync` and `v1_import` build entries from an Ansible inventory or from a V1 site. See `docs/ansible.md` in the Bookmark-Page repository.
