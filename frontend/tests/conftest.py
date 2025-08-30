import os
import sys
import pytest

# Add project root to path for importing tools
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

@pytest.fixture(scope="session", autouse=True)
def _set_env():
    os.environ.setdefault("JWT_SECRET_KEY", "test")
    os.environ.setdefault("SECRET_KEY", "test")
    # use file-based sqlite to persist across sessions in the same process
    os.environ.setdefault("DATABASE_URL", "sqlite:////tmp/forumkit_test.db")
    os.environ.setdefault("UPLOAD_ROOT", "uploads")
    os.environ.setdefault("REDIS_URL", "")  # Disable Redis for tests
    yield


@pytest.fixture(scope="session")
def app(_set_env):
    # Add backend to path for imports
    backend_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'backend')
    sys.path.insert(0, backend_path)
    
    from app import create_app
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
    from utils.db import get_session
    from models import User

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
    from utils.db import get_session
    from models import User

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