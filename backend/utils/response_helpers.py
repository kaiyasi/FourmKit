"""
回應輔助函數
提供統一的 API 回應格式
"""
from flask import jsonify
from typing import Any, Dict, Optional


def success_response(data: Any = None, message: str = "操作成功") -> tuple:
    """
    成功回應格式
    
    Args:
        data: 回應資料
        message: 成功訊息
        
    Returns:
        (response, status_code)
    """
    response = {
        "success": True,
        "message": message
    }
    
    if data is not None:
        response["data"] = data
        
    return jsonify(response), 200


def error_response(message: str, details: Optional[str] = None, status_code: int = 400) -> tuple:
    """
    錯誤回應格式
    
    Args:
        message: 錯誤訊息
        details: 詳細錯誤描述
        status_code: HTTP 狀態碼
        
    Returns:
        (response, status_code)
    """
    response = {
        "success": False,
        "message": message
    }
    
    if details:
        response["details"] = details
        
    return jsonify(response), status_code


def paginated_response(
    data: list, 
    total: int, 
    page: int = 1, 
    per_page: int = 20,
    message: str = "資料獲取成功"
) -> tuple:
    """
    分頁回應格式
    
    Args:
        data: 資料列表
        total: 總筆數
        page: 當前頁碼
        per_page: 每頁筆數
        message: 成功訊息
        
    Returns:
        (response, status_code)
    """
    total_pages = (total + per_page - 1) // per_page
    
    response = {
        "success": True,
        "message": message,
        "data": data,
        "pagination": {
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": total_pages,
            "has_next": page < total_pages,
            "has_prev": page > 1
        }
    }
    
    return jsonify(response), 200


def validation_error_response(errors: Dict[str, str]) -> tuple:
    """
    表單驗證錯誤回應
    
    Args:
        errors: 欄位錯誤字典 {field: error_message}
        
    Returns:
        (response, status_code)
    """
    response = {
        "success": False,
        "message": "資料驗證失敗",
        "errors": errors
    }
    
    return jsonify(response), 422


def not_found_response(resource: str = "資源") -> tuple:
    """
    404 未找到回應
    
    Args:
        resource: 資源名稱
        
    Returns:
        (response, status_code)
    """
    response = {
        "success": False,
        "message": f"{resource}不存在"
    }
    
    return jsonify(response), 404


def unauthorized_response(message: str = "未授權訪問") -> tuple:
    """
    401 未授權回應
    
    Args:
        message: 錯誤訊息
        
    Returns:
        (response, status_code)
    """
    response = {
        "success": False,
        "message": message
    }
    
    return jsonify(response), 401


def forbidden_response(message: str = "權限不足") -> tuple:
    """
    403 禁止訪問回應
    
    Args:
        message: 錯誤訊息
        
    Returns:
        (response, status_code)
    """
    response = {
        "success": False,
        "message": message
    }
    
    return jsonify(response), 403


def server_error_response(message: str = "伺服器內部錯誤") -> tuple:
    """
    500 伺服器錯誤回應
    
    Args:
        message: 錯誤訊息
        
    Returns:
        (response, status_code)
    """
    response = {
        "success": False,
        "message": message
    }
    
    return jsonify(response), 500
