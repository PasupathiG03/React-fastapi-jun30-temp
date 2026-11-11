# Ensure all models are imported so SQLAlchemy mapper relationships (e.g. User <-> Role) are registered
import app.models.role  # noqa: F401
import app.models.user  # noqa: F401
import app.models.access  # noqa: F401
import app.models.api_usage  # noqa: F401
import app.models.bigbasket  # noqa: F401
import app.models.gemini_usage  # noqa: F401
import app.models.menu  # noqa: F401
import app.models.process  # noqa: F401
import app.models.ticket  # noqa: F401
import app.models.workflow  # noqa: F401

