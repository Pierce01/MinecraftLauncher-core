import { LibType, Rule } from '@/types';

export default interface Version {
    assetIndex: {
        id: string;
        sha1: string;
        size: number;
        totalSize: number;
        url: string;
    };
    assets: string;
    complianceLevel: number;
    downloads: {
        client: {
            sha1: string;
            size: number;
            url: string;
        };
    };
    id: string;
    libraries: LibType[];
    arguments?: {
        game: string | Rule | string[];
        jvm?: string | Rule | string[];
    };
    minecraftArguments?: string;
    type: string;
    mainClass: string;
}
