"""Account deletion request initiation is authenticated and never deletes data."""
import pytest


@pytest.fixture
def deletion_router(client):
    import main
    from studio.deletion_routes import router
    if not any(getattr(route, "path", "") == "/studio/account/deletion-request" for route in main.app.routes):
        main.app.include_router(router)
    return client


def test_deletion_request_confirmation_idempotency_and_cancel(deletion_router, db_session, as_user):
    user = as_user(auth0_sub="auth0|deletion-lifecycle")
    import main
    from studio.deletion_models import AccountDeletionRequest
    from studio.models import AuditEvent

    assert deletion_router.get("/studio/account/deletion-request").json()["status"] == "none"
    invalid = deletion_router.post("/studio/account/deletion-request", json={"confirm_phrase": "delete"})
    assert invalid.status_code == 400
    assert deletion_router.post("/studio/account/deletion-request", json={"confirm_phrase": "DELETE MY ACCOUNT"}).status_code == 201
    first = deletion_router.get("/studio/account/deletion-request").json()
    replay = deletion_router.post("/studio/account/deletion-request", json={"confirm_phrase": "DELETE MY ACCOUNT"}).json()
    assert replay["id"] == first["id"]
    assert replay["status"] == "pending"
    assert db_session.query(AccountDeletionRequest).filter_by(user_id=user.id).count() == 1
    assert db_session.query(AuditEvent).filter_by(action="account.deletion_requested").count() == 1

    assert deletion_router.delete("/studio/account/deletion-request").json()["status"] == "canceled"
    assert deletion_router.delete("/studio/account/deletion-request").status_code == 409
    assert db_session.get(type(user), user.id) is user
    assert db_session.query(AuditEvent).filter_by(action="account.deletion_request_canceled").count() == 1


def test_deletion_request_requires_auth(deletion_router):
    import main
    from auth.dependency import current_user
    main.app.dependency_overrides.pop(current_user, None)
    response = deletion_router.get("/studio/account/deletion-request")
    assert response.status_code == 401
