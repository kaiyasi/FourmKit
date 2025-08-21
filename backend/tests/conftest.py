import os
import pytest


@pytest.fixture(scope="session", autouse=True)
def _set_env():
    os.environ.setdefault("JWT_SECRET_KEY", "test")
    os.environ.setdefault("SECRET_KEY", "test")
    # use file-based sqlite to persist across sessions in the same process
    os.environ.setdefault("DATABASE_URL", "sqlite:////tmp/forumkit_test.db")
    os.environ.setdefault("UPLOAD_ROOT", "uploads")
    yield


@pytest.fixture(scope="session")
def app(_set_env):
    from app import create_app  # type: ignore
    a = create_app()
    a.testing = True
    return a


@pytest.fixture()
def client(app):
    return app.test_client()


@pytest.fixture()
def auth_token(app, client):
    # seed a user and login
    from werkzeug.security import generate_password_hash
    from utils.db import get_session  # type: ignore
    from models import User  # type: ignore

    username = "tester"
    password = "pw"
    with get_session() as s:
        if not s.query(User).filter_by(username=username).first():
            u = User(username=username, password_hash=generate_password_hash(password), role="user")
            s.add(u)
            s.commit()

    r = client.post("/api/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.data
    return r.get_json()["access_token"]


@pytest.fixture()
def admin_token(app, client):
    from werkzeug.security import generate_password_hash
    from utils.db import get_session  # type: ignore
    from models import User  # type: ignore

    username = "admin_test"
    password = "pw"
    with get_session() as s:
        if not s.query(User).filter_by(username=username).first():
            u = User(username=username, password_hash=generate_password_hash(password), role="admin")
            s.add(u)
            s.commit()

    r = client.post("/api/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.data
    return r.get_json()["access_token"]
