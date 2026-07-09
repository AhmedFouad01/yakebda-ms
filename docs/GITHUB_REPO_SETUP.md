<div dir="rtl" align="right">

# GitHub Repo Setup — YAKEBDA MS

## Repo recommended settings

```text
Owner: AhmedFouad01
Repository name: yakebda-ms
Visibility: Private initially
Description: Arabic-first RTL restaurant management system for YAKEBDA — POS, menu, kitchen, payments, reports, and hardware bridge.
Topics: restaurant-management, pos, rtl, arabic, nodejs, react, postgresql, typescript
Default branch: main
```

## Option A — GitHub UI

1. افتح GitHub.
2. New repository.
3. الاسم: `yakebda-ms`.
4. خليه Private.
5. لا تضيف README ولا .gitignore ولا License من GitHub؛ الملفات موجودة هنا.
6. من فولدر المشروع:

```bash
git init
git branch -M main
git add .
git commit -m "Initial YAKEBDA MS repository"
git remote add origin git@github.com:AhmedFouad01/yakebda-ms.git
git push -u origin main
```

## Option B — GitHub CLI

```bash
gh repo create AhmedFouad01/yakebda-ms --private --source . --remote origin --push
```

## After push

- Enable branch protection for `main`.
- Require GitHub Actions CI.
- Do development on `dev` or feature branches.
- Create issues from Operational Gap template.

</div>
