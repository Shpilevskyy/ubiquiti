import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import {
  SOCKET_EVENTS,
  type GetListResponse,
  type ListJoinPayload,
  type ListLeavePayload,
  type SubTaskCreatedPayload,
  type SubTaskDeletedPayload,
  type SubTaskUpdatedPayload,
  type Todo,
  type TodoDeletedPayload,
  type List,
  type SubTask,
} from '@ubiquiti-todo/shared';
import { getMember } from '../lib/member';

// Subscribes to the realtime change events for one list (specs/04-realtime-protocol.md) and
// applies them to the TanStack Query cache directly, so collaborators' edits show up without a
// refetch. REST responses remain the source of truth for the tab that made the change — this
// hook is only for what *other* tabs/clients need to see.
export function useListSocket(listId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!listId) return;

    const queryKey = ['list', listId];
    const socket = io();
    const member = getMember();

    function join() {
      const payload: ListJoinPayload = { listId: listId!, member };
      socket.emit(SOCKET_EVENTS.LIST_JOIN, payload);
    }

    function updateTodo(todoId: string, update: (todo: Todo) => Todo) {
      queryClient.setQueryData<GetListResponse>(queryKey, (old) =>
        old
          ? { ...old, todos: old.todos.map((todo) => (todo.id === todoId ? update(todo) : todo)) }
          : old,
      );
    }

    socket.on('connect', join);

    socket.on(SOCKET_EVENTS.LIST_UPDATED, ({ list }: { list: List }) => {
      queryClient.setQueryData<GetListResponse>(queryKey, (old) => (old ? { ...old, list } : old));
    });

    socket.on(SOCKET_EVENTS.TODO_CREATED, ({ todo }: { todo: Todo }) => {
      queryClient.setQueryData<GetListResponse>(queryKey, (old) =>
        old && !old.todos.some((existing) => existing.id === todo.id)
          ? { ...old, todos: [...old.todos, todo] }
          : old,
      );
    });

    socket.on(SOCKET_EVENTS.TODO_UPDATED, ({ todo }: { todo: Todo }) => {
      queryClient.setQueryData<GetListResponse>(queryKey, (old) =>
        old ? { ...old, todos: old.todos.map((existing) => (existing.id === todo.id ? todo : existing)) } : old,
      );
    });

    socket.on(SOCKET_EVENTS.TODO_DELETED, ({ todoId }: TodoDeletedPayload) => {
      queryClient.setQueryData<GetListResponse>(queryKey, (old) =>
        old ? { ...old, todos: old.todos.filter((todo) => todo.id !== todoId) } : old,
      );
    });

    socket.on(SOCKET_EVENTS.SUBTASK_CREATED, ({ todoId, subtask }: SubTaskCreatedPayload) => {
      updateTodo(todoId, (todo) =>
        todo.subtasks.some((existing) => existing.id === subtask.id)
          ? todo
          : { ...todo, subtasks: [...todo.subtasks, subtask] },
      );
    });

    socket.on(SOCKET_EVENTS.SUBTASK_UPDATED, ({ todoId, subtask }: SubTaskUpdatedPayload) => {
      updateTodo(todoId, (todo) => ({
        ...todo,
        subtasks: todo.subtasks.map((existing: SubTask) => (existing.id === subtask.id ? subtask : existing)),
      }));
    });

    socket.on(SOCKET_EVENTS.SUBTASK_DELETED, ({ todoId, subtaskId }: SubTaskDeletedPayload) => {
      updateTodo(todoId, (todo) => ({
        ...todo,
        subtasks: todo.subtasks.filter((existing: SubTask) => existing.id !== subtaskId),
      }));
    });

    return () => {
      const payload: ListLeavePayload = { listId };
      socket.emit(SOCKET_EVENTS.LIST_LEAVE, payload);
      socket.disconnect();
    };
  }, [listId, queryClient]);
}
