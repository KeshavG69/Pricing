"""
Onboarding router for tracking user onboarding progress.
Handles product tour state and setup guide checklist.
"""

from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel
from typing import Optional, Dict, Any
from auth.dependencies import get_current_user
from utils.onboarding import get_onboarding_crud, ONBOARDING_TASKS
from utils.helpers import serialize_doc


router = APIRouter(prefix="/onboarding", tags=["onboarding"])


class UpdateTaskRequest(BaseModel):
    """Request body for updating a task"""
    task_id: str
    completed: bool


class CompleteTourRequest(BaseModel):
    """Request body for completing/skipping tour"""
    skipped: bool = False


class DismissChecklistRequest(BaseModel):
    """Request body for dismissing checklist"""
    dismissed: bool = True


class CollapseChecklistRequest(BaseModel):
    """Request body for toggling checklist collapse"""
    collapsed: bool


@router.get("/tasks")
async def get_task_definitions(current_user: dict = Depends(get_current_user)):
    """
    Get task definitions (metadata) filtered by user's role

    Returns:
        List of task definitions with labels, descriptions, and order
    """
    try:
        onboarding_crud = get_onboarding_crud()
        user_role = current_user.get("role", "user")

        # Get applicable task IDs for this role
        applicable_task_ids = onboarding_crud.get_applicable_tasks(user_role)

        # Build task metadata list
        task_definitions = []
        for task_id in applicable_task_ids:
            task_meta = ONBOARDING_TASKS[task_id]
            task_definitions.append({
                "id": task_id,
                "label": task_meta["label"],
                "description": task_meta["description"],
                "order": task_meta["order"]
            })

        # Sort by order
        task_definitions.sort(key=lambda x: x["order"])

        return {
            "tasks": task_definitions,
            "role": user_role
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch task definitions: {str(e)}"
        )


@router.get("/progress")
async def get_progress(current_user: dict = Depends(get_current_user)):
    """
    Get user's onboarding progress (role-filtered)

    Returns:
        Onboarding progress with completion stats based on user's role
    """
    try:
        onboarding_crud = get_onboarding_crud()

        # Get or create progress (filtered by role)
        progress = onboarding_crud.get_or_create_progress(
            user_id=str(current_user["_id"]),
            organization_id=str(current_user["organization_id"]),
            role=current_user.get("role", "user")
        )

        # Serialize (completion_stats already included by get_or_create_progress)
        result = serialize_doc(progress)

        return result

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch onboarding progress: {str(e)}"
        )


@router.put("/task")
async def update_task(
    request: UpdateTaskRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Update a specific task completion status

    Args:
        request: Task ID and completion status

    Returns:
        Updated progress with completion stats (role-filtered)
    """
    try:
        onboarding_crud = get_onboarding_crud()

        # Update task
        success = onboarding_crud.update_task(
            user_id=str(current_user["_id"]),
            organization_id=str(current_user["organization_id"]),
            task_id=request.task_id,
            completed=request.completed
        )

        if not success:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to update task"
            )

        # Get updated progress (filtered by role)
        progress = onboarding_crud.get_or_create_progress(
            user_id=str(current_user["_id"]),
            organization_id=str(current_user["organization_id"]),
            role=current_user.get("role", "user")
        )

        # Serialize (completion_stats already included)
        result = serialize_doc(progress)

        return {
            "message": "Task updated successfully",
            "progress": result
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update task: {str(e)}"
        )


@router.post("/tour/start")
async def start_tour(current_user: dict = Depends(get_current_user)):
    """
    Mark product tour as started

    Returns:
        Success message
    """
    try:
        onboarding_crud = get_onboarding_crud()

        success = onboarding_crud.start_tour(
            user_id=str(current_user["_id"]),
            organization_id=str(current_user["organization_id"])
        )

        if not success:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to start tour"
            )

        return {"message": "Tour started successfully"}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start tour: {str(e)}"
        )


@router.post("/tour/complete")
async def complete_tour(
    request: CompleteTourRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Mark product tour as completed or skipped

    Args:
        request: Whether tour was skipped

    Returns:
        Success message with updated progress (role-filtered)
    """
    try:
        onboarding_crud = get_onboarding_crud()

        success = onboarding_crud.complete_tour(
            user_id=str(current_user["_id"]),
            organization_id=str(current_user["organization_id"]),
            skipped=request.skipped
        )

        if not success:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to complete tour"
            )

        # Get updated progress (filtered by role)
        progress = onboarding_crud.get_or_create_progress(
            user_id=str(current_user["_id"]),
            organization_id=str(current_user["organization_id"]),
            role=current_user.get("role", "user")
        )

        return {
            "message": "Tour skipped" if request.skipped else "Tour completed successfully",
            "progress": serialize_doc(progress)
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to complete tour: {str(e)}"
        )


@router.put("/checklist/dismiss")
async def dismiss_checklist(
    request: DismissChecklistRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Dismiss or restore setup guide checklist

    Args:
        request: Whether to dismiss or restore

    Returns:
        Success message
    """
    try:
        onboarding_crud = get_onboarding_crud()

        success = onboarding_crud.dismiss_checklist(
            user_id=str(current_user["_id"]),
            organization_id=str(current_user["organization_id"]),
            dismissed=request.dismissed
        )

        if not success:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to update checklist"
            )

        return {
            "message": "Checklist dismissed" if request.dismissed else "Checklist restored"
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update checklist: {str(e)}"
        )


@router.put("/checklist/collapse")
async def toggle_collapse(
    request: CollapseChecklistRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Toggle checklist collapsed state

    Args:
        request: Whether checklist is collapsed

    Returns:
        Success message
    """
    try:
        onboarding_crud = get_onboarding_crud()

        success = onboarding_crud.toggle_checklist_collapsed(
            user_id=str(current_user["_id"]),
            organization_id=str(current_user["organization_id"]),
            collapsed=request.collapsed
        )

        if not success:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to toggle checklist"
            )

        return {"message": "Checklist state updated"}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to toggle checklist: {str(e)}"
        )
