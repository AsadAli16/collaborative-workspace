from rest_framework import generics, permissions
from django.contrib.auth.models import User
from .models import Workspace, Task
from .serializers import WorkspaceSerializer, TaskSerializer, UserRegistrationSerializer

class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = UserRegistrationSerializer
    permission_classes = [permissions.AllowAny]

class WorkspaceListCreateView(generics.ListCreateAPIView):
    serializer_class = WorkspaceSerializer

    def get_queryset(self):
        return Workspace.objects.filter(members=self.request.user) | Workspace.objects.filter(created_by=self.request.user)

    def perform_create(self, serializer):
        workspace = serializer.save(created_by=self.request.user)
        workspace.members.add(self.request.user)

class WorkspaceDetailView(generics.RetrieveDestroyAPIView):
    serializer_class = WorkspaceSerializer

    def get_queryset(self):
        return Workspace.objects.filter(members=self.request.user) | Workspace.objects.filter(created_by=self.request.user)

class TaskListCreateView(generics.ListCreateAPIView):
    serializer_class = TaskSerializer

    def get_queryset(self):
        workspace_id = self.request.query_params.get('workspace')
        if workspace_id:
            return Task.objects.filter(workspace_id=workspace_id)
        return Task.objects.none()

class TaskDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Task.objects.all()
    serializer_class = TaskSerializer
