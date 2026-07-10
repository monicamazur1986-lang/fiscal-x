import { EventEmitter } from 'events';
import { FirestorePermissionError } from './errors';

class FirebaseErrorEmitter extends EventEmitter {
  emit(event: 'permission-error', error: FirestorePermissionError): boolean {
    return super.emit(event, error);
  }
}

export const errorEmitter = new FirebaseErrorEmitter();