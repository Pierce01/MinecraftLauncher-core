export default interface User {
    access_token: string;
    client_token: string;
    uuid: string;
    name: string;
    meta?: {
        type: 'mojang' | 'msa';
        demo?: boolean;
    };
}
