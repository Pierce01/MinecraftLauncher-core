import { Rule } from '@/types';

export type CustomArtifactType = {
    name: string;
    url: string;
    sha1?: string;
    size?: number;
};

export type CustomLibType = {
    id: string;
    mainClass: string;
    arguments: {
        game: string | Rule | string[];
        jvm: string | Rule | string[];
    };
    mavenFiles?: {
        name: string;
        url: string;
    }[];
    libraries: CustomArtifactType[];
};
