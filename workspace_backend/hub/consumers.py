import json
from channels.generic.websocket import AsyncWebsocketConsumer

class WorkspaceConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.workspace_id = self.scope['url_route']['kwargs']['workspace_id']
        self.room_group_name = f'workspace_{self.workspace_id}'

        # Join workspace room group
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        await self.accept()

    async def disconnect(self, close_code):
        # Leave workspace room group
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

    # Receive message from WebSocket (from client)
    async def receive(self, text_data):
        data = json.loads(text_data)
        
        # Broadcast event to group
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'workspace_update',
                'payload': data
            }
        )

    # Receive broadcast from room group
    async def workspace_update(self, event):
        payload = event['payload']
        # Send message to WebSocket client
        await self.send(text_data=json.dumps(payload))