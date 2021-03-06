//──────────────────────────────────────────────────────────────────────────────
// Imports: Enonic XP libs (build.gradle)
//──────────────────────────────────────────────────────────────────────────────
import {getSite as getCurrentSite, pageUrl} from '/lib/xp/portal';
import {get as getContent, modify as modifyContent, publish as publishContent, query as queryContent} from '/lib/xp/content';
import {isSet} from '/lib/enonic/util/value';
import {toStr} from '/lib/enonic/util';
//──────────────────────────────────────────────────────────────────────────────
// Imports: Application libs
//──────────────────────────────────────────────────────────────────────────────
import {and, fulltext, group, like, ngram, or, propIn} from '/lib/query'
import {getContentParent, getNearestContentByType, getSitePath} from '/lib/util'
import {CT_ARTICLE, CT_DOCPAGE, CT_DOCVERSION, CT_GUIDE, isDocPage, isDocVersion} from '/content-types';
import {propEq} from './query.es';

//──────────────────────────────────────────────────────────────────────────────
// Private Constants
//──────────────────────────────────────────────────────────────────────────────
const DEBUG = true;
const TRACE = false;
const DRAFT_BRANCH = 'draft';
const MASTER_BRANCH = 'master';

//──────────────────────────────────────────────────────────────────────────────
// Private functions
//──────────────────────────────────────────────────────────────────────────────
function toSearchResultEntry(content, currentSite, hideVersion) {
    if (!content) {
        return;
    }

    const result = {
        name: getSearchResultName(content, hideVersion),
        title: content.data.title || content.displayName,
        url: pageUrl({path: content._path}),
        path: content._path.replace(currentSite._path + '/', ''),
        extract: content.data.raw ? content.data.raw.substr(0, 64) + '...' : null
    };

    return result;
}


function getSearchResultName(content, hideVersion) {
    if (isDocPage(content)) {
        const parentDocVersion = getNearestContentByType(content, 'docversion');

        if (!parentDocVersion || hideVersion) {
            return content.displayName;
        }

        return content.displayName + ' (' + parentDocVersion.displayName + ')';
    }

    if (isDocVersion(content)) {
        const doc = getContentParent(content);
        if (hideVersion) {
            return doc.displayName;
        }

        return doc.displayName + ' (' + content.displayName + ')';
    }

    return content.displayName;
}

function findDocPagesAndDocVersions(doc) {
    const expr = and(
        propIn('type', [CT_DOCPAGE, CT_DOCVERSION]),
        like('_path', '/content' + doc._path + '/*'));

    const result = queryContent({
        query: expr,
        start: 0,
        count: 1000,
        branch: DRAFT_BRANCH
    });

    return result.hits;
}

function findDocVersions(doc) {
    const expr = and(
        propIn('type', [CT_DOCVERSION]),
        like('_path', '/content' + doc._path + '/*'));

    const result = queryContent({
        query: expr,
        start: 0,
        count: 1000,
        branch: DRAFT_BRANCH
    });

    return result.hits;
}

function findDocVersionByCheckout(doc, checkout) {
    const expr = and(
        propIn('type', [CT_DOCVERSION]),
        like('_path', '/content' + doc._path + '/*'),
        propEq('data.commit', checkout));

    const result = queryContent({
        query: expr,
        start: 0,
        count: 1000,
        branch: DRAFT_BRANCH
    });

    if (result.total > 0) {
        return result.hits[0];
    }

    return null;
}

function setLatestOnContent(content, latest) {
    log.info('Setting latest "' + latest + '" on ' + content._path);

    modifyContent({
        key: content._id,
        editor: function (c) {
            c.data.latest = latest;
            return c;
        },
        requireValid: false,
        branch: DRAFT_BRANCH
    });
}

function isLatest(content) {
    const isLatestRegExp = /^true$/i;

    return isLatestRegExp.test(content.data.latest);
}

function doMarkLatest(docVersion, publish) {
    let updated = false;

    if (!isLatest(docVersion)) {
        setLatestOnContent(docVersion, true);
        updated = true;
    }

    const contents = findDocPagesAndDocVersions(docVersion);
    contents.filter((content) => !isLatest(content)).forEach((content) => {
        setLatestOnContent(content, true);
        updated = true;
    });

    if (publish && updated) {
        publishTree(docVersion);
    }
}

function doUnMarkLatest(docVersion, publish) {
    let updated = false;

    if (isLatest(docVersion)) {
        setLatestOnContent(docVersion, false);
        updated = true;
    }

    const contents = findDocPagesAndDocVersions(docVersion);
    contents.filter((content) => isLatest(content)).forEach((content) => {
        setLatestOnContent(content, false);
        updated = true;
    });

    if (publish && updated) {
        publishTree(docVersion);
    }
}

function isPublished(content) {
    return !!getContent({
        key: content._id,
        branch: MASTER_BRANCH
    })
}

function publishTree(content) {
    log.info('Publishing ' + content._path);

    publishContent({
        keys: [content._id],
        sourceBranch: DRAFT_BRANCH,
        targetBranch: MASTER_BRANCH
    })
}

//──────────────────────────────────────────────────────────────────────────────
// Exports
//──────────────────────────────────────────────────────────────────────────────
exports.search = function (query, path, start, count) {
    TRACE && log.info('search(' + query + ', ' + path + ', ' + start + ', ' + count + ')');
    if (!isSet(query)) {
        query = '';
    }

    const hideVersion = !!path;
    const restrictSearchToLatestOnly = !path;
    path = '/content' + (!!path ? path : getSitePath());

    const fields = [ // have not checked CT_DOCPAGE
        'data.title^3', // CT_DOCPAGE and CT_DOCVERSION
        'displayName^2', // All content
        'data.shortdescription^1', // CT_GUIDE
        'data.tags^1', // CT_GUIDE
        'data.repository^1', // CT_GUIDE
        'data.raw', // CT_DOCPAGE, CT_DOCVERSION and CT_GUIDE
        'data.html' // CT_ARTICLE; NOTE data.raw covers this.
        //'data.menu' // NOTE We don't want to search this!
        //'_alltext' // NOTE Nope there are things we don't want to search!
    ].join(',');

    let expr = and(
        propIn('type', [CT_DOCPAGE, CT_DOCVERSION, CT_GUIDE, CT_ARTICLE]),
        group(or(
            like('_path', path + '/*'),
            like('_path', path)
        )),
        group(or(
            fulltext(fields, query, 'AND'),
            ngram(fields, query, 'AND')
        )));

    if (restrictSearchToLatestOnly) {
        expr = and(
            expr,
            group(or(
                like('data.latest', 'true'),
                propIn('type', [CT_GUIDE, CT_ARTICLE]),
            ))
        );
    }

    DEBUG && log.info('expr: ' + toStr(expr));

    const result = queryContent({
        query: expr,
        start: start || 0,
        count: count || 100,
        branch: DRAFT_BRANCH
    });

    const currentSite = getCurrentSite();
    const entries = [];
    for (let i = 0; i < result.hits.length; i++) {
        const hit = result.hits[i];
        const entry = toSearchResultEntry(hit, currentSite, hideVersion);
        if (entry) {
            entry.score = hit.score;
            entries.push(entry);
        }
    }

    return {
        total: result.total,
        count: entries.length,
        hits: entries
    };
}; // exports.search

exports.markLatest = function (doc, latestCheckout) {
    const docVersions = findDocVersions(doc);
    const latestDocVersion = docVersions.filter((docVersion) => docVersion.data.commit === latestCheckout)[0];
    const nonLatestDocVersions = docVersions.filter((docVersion) => docVersion.data.commit !== latestCheckout);

    const isDocPublished = isPublished(doc);
    doMarkLatest(latestDocVersion, isDocPublished);
    nonLatestDocVersions.forEach((nonLatestDocVersion) => doUnMarkLatest(nonLatestDocVersion, isDocPublished));
};

exports.findDocVersions = function (doc) {
    const expr = and(
        propIn('type', [CT_DOCVERSION]),
        like('_path', '/content' + doc._path + '/*'));

    const result = queryContent({
        query: expr,
        start: 0,
        count: 100,
        branch: DRAFT_BRANCH
    });

    return result.hits;
};

exports.findLatestDocVersion = function (doc) {
    const expr = and(
        propIn('type', [CT_DOCVERSION]),
        like('_path', '/content' + doc._path + '/*'),
        like('data.latest', 'true'));

    const result = queryContent({
        query: expr,
        start: 0,
        count: 100,
        branch: DRAFT_BRANCH
    });

    if (result.total > 0) {
        return result.hits[0];
    }

    return null;
};

exports.findDocVersionByCheckout = function (doc, checkout) {
    return findDocVersionByCheckout(doc, checkout);
};

exports.findChildren = function (content) {
    const expr = like('_path', '/content' + content._path + '/*');

    const result = queryContent({
        query: expr,
        start: 0,
        count: 1000,
        branch: DRAFT_BRANCH
    });

    return result.hits;
};

exports.isPublished = function (content) {
    return isPublished(content);
};

exports.publishTree = function (content) {
    return publishTree(content);
}
