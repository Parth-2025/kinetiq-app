"""Server-operator administration; never exposed as a public signup action.

From backend/: python -m studio.admin --subject 'auth0|...' --grant
Use --revoke to remove administrator access.
"""
import argparse
from sqlalchemy import select
from db.models import User
from db.session import SessionLocal
from studio.access import account, audit


def main():
    parser = argparse.ArgumentParser(description="Provision Studio administrator access for an existing account.")
    parser.add_argument("--subject", required=True, help="Exact Auth0 subject of the existing user")
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--grant", action="store_true")
    action.add_argument("--revoke", action="store_true")
    args = parser.parse_args()
    with SessionLocal.begin() as db:
        user = db.scalar(select(User).where(User.auth0_sub == args.subject))
        if not user:
            parser.error("Account not found. The user must sign in first.")
        item = account(db, user)
        item.is_admin = args.grant
        audit(db, user, "admin.server_provisioned", user.id, {"granted": args.grant, "actor_type": "server_operator"})
    print("Administrator access granted." if args.grant else "Administrator access revoked.")


if __name__ == "__main__":
    main()
