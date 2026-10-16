/* Preparation des tests : on simule IndexedDB en memoire.
   Sans cela, les tests qui ecrivent en base ne pourraient pas
   tourner dans Node. En production, c'est le vrai IndexedDB
   du navigateur qui prend le relais — le code est identique. */
import 'fake-indexeddb/auto'