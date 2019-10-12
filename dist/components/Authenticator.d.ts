interface UserProfile {
    access_token: any;
    client_token: any;
    uuid: any;
    name: string;
    selected_profile?: string;
    user_properties: string;
}
declare const _default: {
    /**
     * Get authentication
     * @param {string} username Username to login with
     * @param {string?} password Password, Leave null for offline mode
     * @returns {Promise<UserProfile>}
     */
    getAuth: (username: string, password?: string | undefined) => Promise<UserProfile>;
    validate: (access_token: string, client_token: string) => Promise<unknown>;
    refreshAuth: (accessToken: string, clientToken: string, selectedProfile: string) => Promise<unknown>;
    invalidate: (accessToken: string, clientToken: string) => Promise<unknown>;
    signOut: (username: string, password: string) => Promise<unknown>;
};
export default _default;
