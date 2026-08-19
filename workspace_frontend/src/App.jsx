import React, { useState, useEffect, useRef } from 'react';

const API_BASE = 'http://127.0.0.1:8000/api';

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);

  const [workspaces, setWorkspaces] = useState([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState(null);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');

  const [tasks, setTasks] = useState([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);
  const socketRef = useRef(null);

  // Auth Action
  const handleAuth = async (e) => {
    e.preventDefault();
    const endpoint = isRegistering ? '/auth/register/' : '/auth/login/';
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok) {
        if (isRegistering) {
          alert('Account registered successfully! Please log in.');
          setIsRegistering(false);
          setPassword('');
        } else {
          setToken(data.access);
          localStorage.setItem('token', data.access);
        }
      } else {
        alert(data.detail || 'Authentication failed');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const logout = () => {
    setToken(null);
    localStorage.removeItem('token');
    setSelectedWorkspace(null);
    setTasks([]);
  };

  // Fetch Workspaces
  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/workspaces/`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => setWorkspaces(Array.isArray(data) ? data : []))
      .catch(console.error);
  }, [token]);

  // Handle Workspace WebSockets & Task Loading
  useEffect(() => {
    if (!selectedWorkspace || !token) return;

    // Load Tasks instantly
    fetch(`${API_BASE}/tasks/?workspace=${selectedWorkspace.id}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => setTasks(Array.isArray(data) ? data : []));

    // Connect WebSocket
    const wsUrl = `ws://127.0.0.1:8000/ws/workspace/${selectedWorkspace.id}/`;
    socketRef.current = new WebSocket(wsUrl);

    socketRef.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.action === 'TASK_CREATED') {
          setTasks(prev => prev.some(t => t.id === data.task.id) ? prev : [...prev, data.task]);
        } else if (data.action === 'TASK_MOVED') {
          setTasks(prev => prev.map(t => t.id === data.task.id ? data.task : t));
        }
      } catch (e) {
        console.error('WS parsing error:', e);
      }
    };

    return () => {
      if (socketRef.current) socketRef.current.close();
    };
  }, [selectedWorkspace, token]);

  // Create Workspace (Immediate UI State Update)
  const createWorkspace = async (e) => {
    e.preventDefault();
    if (!newWorkspaceName.trim()) return;

    try {
      const res = await fetch(`${API_BASE}/workspaces/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ name: newWorkspaceName })
      });
      if (res.ok) {
        const created = await res.json();
        setWorkspaces(prev => [...prev, created]);
        setSelectedWorkspace(created);
        setNewWorkspaceName('');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Create Task (Immediate Local + WebSocket Broadcast)
  const createTask = async (e) => {
    e.preventDefault();
    if (!newTaskTitle.trim() || !selectedWorkspace) return;

    try {
      const res = await fetch(`${API_BASE}/tasks/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ workspace: selectedWorkspace.id, title: newTaskTitle, status: 'TODO' })
      });

      if (res.ok) {
        const task = await res.json();
        // Update local state instantly
        setTasks(prev => [...prev, task]);
        setNewTaskTitle('');

        // Broadcast to WebSocket if connected
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          socketRef.current.send(JSON.stringify({ action: 'TASK_CREATED', task }));
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Move Task (Immediate Local + WebSocket Broadcast)
  const moveTask = async (taskId, newStatus) => {
    // Optimistic UI update
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));

    try {
      const res = await fetch(`${API_BASE}/tasks/${taskId}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus })
      });

      if (res.ok) {
        const updatedTask = await res.json();
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          socketRef.current.send(JSON.stringify({ action: 'TASK_MOVED', task: updatedTask }));
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Drag Handlers
  const handleDragStart = (e, taskId) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.setData('text/plain', taskId);
  };

  const handleDrop = (e, targetStatus) => {
    e.preventDefault();
    setDragOverCol(null);
    if (draggedTaskId) {
      moveTask(draggedTaskId, targetStatus);
      setDraggedTaskId(null);
    }
  };

  if (!token) {
    return (
      <div className="app-container" style={{ maxWidth: '420px', marginTop: '100px' }}>
        <div className="card">
          <h2 style={{ textAlign: 'center', marginBottom: '24px' }}>{isRegistering ? 'Create Account' : 'Welcome Back'}</h2>
          <form onSubmit={handleAuth}>
            <input type="text" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} required />
            <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />
            <button className="btn" type="submit" style={{ width: '100%', marginTop: '12px' }}>
              {isRegistering ? 'Register' : 'Sign In'}
            </button>
          </form>
          <p style={{ marginTop: '20px', textAlign: 'center', color: '#94a3b8', cursor: 'pointer' }} onClick={() => setIsRegistering(!isRegistering)}>
            {isRegistering ? 'Already have an account? Sign In' : "Don't have an account? Register"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="top-header">
        <div>
          <h1 style={{ margin: 0, fontSize: '22px' }}>Workspace Engine</h1>
          <span style={{ color: '#94a3b8', fontSize: '13px' }}>Real-time Collaboration Hub</span>
        </div>
        <button className="btn btn-secondary" onClick={logout}>Logout</button>
      </header>

      <div className="card">
        <form onSubmit={createWorkspace} style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
          <input type="text" placeholder="Workspace Name..." value={newWorkspaceName} onChange={e => setNewWorkspaceName(e.target.value)} />
          <button className="btn" type="submit" style={{ height: '44px', whiteSpace: 'nowrap' }}>+ New Workspace</button>
        </form>

        <div className="workspace-chips">
          {workspaces.map(ws => (
            <button
              key={ws.id}
              className={`ws-chip ${selectedWorkspace?.id === ws.id ? 'active' : ''}`}
              onClick={() => setSelectedWorkspace(ws)}
            >
              {ws.name}
            </button>
          ))}
        </div>
      </div>

      {selectedWorkspace && (
        <div>
          <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0 }}>{selectedWorkspace.name}</h2>
            <form onSubmit={createTask} style={{ display: 'flex', gap: '10px', width: '60%' }}>
              <input type="text" placeholder="Type task title and press Enter..." value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} style={{ margin: 0 }} />
              <button className="btn" type="submit">Add Task</button>
            </form>
          </div>

          <div className="kanban-board">
            {['TODO', 'IN_PROGRESS', 'DONE'].map(status => {
              const colTasks = tasks.filter(t => t && t.status === status);
              return (
                <div
                  key={status}
                  className={`kanban-col ${dragOverCol === status ? 'drag-over' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setDragOverCol(status); }}
                  onDragLeave={() => setDragOverCol(null)}
                  onDrop={(e) => handleDrop(e, status)}
                >
                  <div className="col-header">
                    <h3 style={{ margin: 0, fontSize: '16px' }}>{status.replace('_', ' ')}</h3>
                    <span className={`badge badge-${status}`}>{colTasks.length}</span>
                  </div>

                  {colTasks.map(task => (
                    <div
                      key={task.id}
                      className="task-card"
                      draggable
                      onDragStart={(e) => handleDragStart(e, task.id)}
                    >
                      <h4 style={{ margin: '0 0 10px 0', fontSize: '15px' }}>{task.title}</h4>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>Drag card to move</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}