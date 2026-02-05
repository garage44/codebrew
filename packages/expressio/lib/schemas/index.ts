/**
 * Central export point for all schema types
 * This allows frontend to import types from a single location
 */

export type {
    GetConfigResponse,
    UpdateConfigRequest,
    UpdateConfigResponse,
    WorkspaceDescription,
} from './config.ts'

export type {
    UploadAvatarParams,
    UploadAvatarResponse,
} from './users.ts'

export type {
    CreatePathRequest,
    DeletePathRequest,
    MovePathRequest,
    CollapsePathRequest,
    UpdateTagRequest,
    TranslateRequest,
    TranslateResponse,
    GetTranslationsParams,
} from './i18n.ts'

export type {
    BrowseRequest,
    BrowseResponse,
    GetWorkspaceResponse,
    GetUsageResponse,
    UpdateWorkspaceRequest,
    UpdateWorkspaceResponse,
    CreateWorkspaceRequest,
    CreateWorkspaceResponse,
    DeleteWorkspaceResponse,
} from './workspaces.ts'
