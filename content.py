"""Functions used to generate content. """
import os
import math
import csv
import glob
import sqlite3
from collections import OrderedDict

import pandas
import plotly
from random import random, sample

from flask import current_app
from numpy import arange, linspace
from plotly.graph_objs import Layout, Box, Scatter, Scattergl

from .cache import cache
# from .cluster_color_scale import CLUSTER_COLORS


class FailToGraphException(Exception):
    """Fail to generate data or graph due to an internal error.s"""
    pass


# Utilities
def species_exists(species):
    """Check if data for a given species exists by looking for its data directory.

    Arguments:
        species (str): Name of species.

    Returns:
        bool: Whether if given species exists
    """
    return os.path.isdir(
        '{}/{}'.format(current_app.config['DATA_DIR'], species))


def gene_exists(species, gene):
    """Check if data for a given gene of species exists by looking for its data directory.

    Arguments:
        species (str): Name of species.
        gene (str): Name of gene for that species.

    Returns:
        bool: Whether if given gene exists
    """
    try:
        filename = glob.glob('{}/{}/mch/{}*'.format(current_app.config[
            'DATA_DIR'], species, gene))[0]
    except IndexError:
        return False
    return True if filename else False


def build_hover_text(labels):
    """Build HTML for Plot.ly graph labels.

        Arguments:
            labels (dict): Dictionary of attributes to be displayed.

        Returns:
            str: Generated HTML for labels.

        Example:
            >>> build_hover_text({'Test1': 'Value1', 'Example2': 'Words2'})
            'Test1: Value1<br>Example2: Words2'

    """
    text = str()
    for k, v in labels.items():
        text += '{k}: {v}<br>'.format(k=k, v=str(v))

    return text.strip('<br>')


def generate_cluster_colors(num):
    """Generate a list of colors given number needed.

    Arguments:
        num (int): Number of colors needed. n <= 35.

    Returns:
        list: strings containing CSS-style strings e.g. #000000.
    """
    # return palettes.plasma(num)

    c = ['hsl('+str(round(h))+',50%,50%)' for h in linspace(0, 360, num)]
    # Randomize the color order
    c = sample(c,num) 
    return c


def set_color_by_percentile(this, start, end):
    """Set color below or above percentiles to their given values.

    Since the Plot.ly library handles coloring, we work directly with mCH values in this function. The two percentiles
    are generated by the pandas library from the plot-generating method.

    Arguments:
        this (float): mCH value to be compared.
        start (float): Lower end of percentile.
        end (float): Upper end of percentile.

    Returns:
        int: Value of `this`, if it is within percentile limits. Otherwise return one of two percentiles.
    """
    if str(this) == 'nan':
        return 'grey'
    if this < start:
        return start
    elif this > end:
        return end
    return this


def find_orthologs(mmu_gid=str(), hsa_gid=str()):
    """Find orthologs of a gene.

    Either hsa_gID or mmu_gID should be completed.

    Arguments:
        mmu_gid (str): Ensembl gene ID of mouse.
        hsa_gid (str): Ensembl gene ID of human.

    Returns:
        dict: hsa_gID and mmu_gID as strings.
    """
    if not mmu_gid and not hsa_gid:  # Should have at least one.
        return {'mmu_gID': None, 'hsa_gID': None}

    conn = sqlite3.connect(
        '{}/orthologs.sqlite3'.format(current_app.config['DATA_DIR']))
    conn.row_factory = sqlite3.Row  # This ensures dictionaries are returned for fetch results.
    cursor = conn.cursor()

    query_key = 'mmu_gID' if mmu_gid else 'hsa_gID'
    query_value = mmu_gid or hsa_gid
    cursor.execute(
        'SELECT * FROM orthologs WHERE {key}=?'.format(key=query_key),
        (query_value,))
    query_results = cursor.fetchone()
    if not query_results:
        return {'mmu_gID': None, 'hsa_gID': None}
    else:
        return dict(query_results)


@cache.memoize(timeout=3600)
def get_cluster_points(species):
    """Generate points for the tSNE cluster.

    Arguments:
        species (str): Name of species.

    Returns:
        list: cluster points in dict. See tsne_points_ordered.csv of each species for dictionary keys.
        None: if there is an error finding the file of the species.
    """
    if not species_exists(species):
        return None

    try:
        with open('{}/{}/tsne_points_ordered.csv'.format(current_app.config['DATA_DIR'],
                                                 species)) as fp:
            return list(
                csv.DictReader(fp, delimiter='\t', quoting=csv.QUOTE_NONE))
    except IOError:
        return None

@cache.memoize(timeout=3600)
def search_gene_names(species, query):
    """Match gene names of a species.

    Arguments:
        species (str): Name of species.
        query (str): Query string of gene name.

    Returns:
        list: dict of genes found. See gene_id_to_names.csv of each species for dictionary keys. Empty if error during
            searching.
    """
    if not species_exists(species):
        return []

    conn = sqlite3.connect('{}/{}/gene_names.sqlite3'.format(
        current_app.config['DATA_DIR'], species))
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM gene_names WHERE geneName LIKE ?',
                   (query + '%',))
    query_results = cursor.fetchall()
    return [dict(x) for x in query_results][:50]


@cache.memoize(timeout=3600)
def gene_id_to_name(species, query):
    """Match gene ID of a species.

        Arguments:
            species (str): Name of species.
            query (str): Query string of gene ID.

        Returns:
            dict: information of gene found. See gene_id_to_names.csv of each species for dictionary keys.
    """
    if not species_exists(species):
        return []

    conn = sqlite3.connect('{}/{}/gene_names.sqlite3'.format(
        current_app.config['DATA_DIR'], species))
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM gene_names WHERE geneID LIKE ?',
                    (query + '%',))
    query_results = cursor.fetchone()
    return dict(query_results)


@cache.memoize(timeout=3600)
def get_corr_genes(species,query):
    """Get correlated genes of a certain gene of a species. 
    
        Arguments:
            species(str): Name of species.
            query(str): Query string of gene ID.
        
        Returns:
            dict: information of genes that are correlated with target gene.
    """
    conn = sqlite3.connect('{}/{}/top_corr_genes.sqlite3'.format(
        current_app.config['DATA_DIR'], species))
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    try:
        cursor.execute('SELECT Gene2, Correlation FROM corr_genes WHERE Gene1 LIKE ? ORDER BY Correlation DESC LIMIT 50', (query + '%',))
        query_results = list(cursor.fetchall())
        table_data=[]
        for rank, item in enumerate(query_results, 1):
            gene = dict(item)
            geneInfo = gene_id_to_name(species, gene['Gene2'])
            geneInfo['Rank'] = rank
            geneInfo['Corr'] = gene['Correlation']
            table_data.append(geneInfo)
        return(table_data)
    except:
        return(1)


@cache.memoize(timeout=3600)
def get_gene_mch(species, gene, outliers):
    """Return mCH data points for a given gene.

    Data from ID-to-Name mapping and tSNE points are combined for plot generation.

    Arguments:
        species (str): Name of species.
        gene (str): Name of gene for that species.
        outliers (bool): Whether if outliers should be kept.

    Returns:
        list: dict with mCH data for each sample. Keys are samp, tsne_x, tsne_y, cluster_label, cluster_ordered, original,
         normalized.
    """
    if not species_exists(species) or not gene_exists(species, gene):
        return []

    cluster = pandas.DataFrame(get_cluster_points(species))

    try:
        filename = glob.glob('{}/{}/mch/{}*'.format(current_app.config[
            'DATA_DIR'], species, gene))[0]
    except IndexError:
        return []

    try:
        mch = pandas.read_csv(
            filename,
            sep='\t',
            header=None,
            names=['gene', 'samp', 'original', 'normalized'])
    except FileNotFoundError:
        return []

    dataframe_merged = pandas.merge(
        cluster[['samp', 'tsne_x', 'tsne_y', 'cluster_label', 'cluster_name', 'cluster_ordered', 'cluster_ortholog']],
        mch[['samp', 'original', 'normalized']],
        on='samp',
        how='left')
    if not outliers:
        # Outliers not wanted, remove rows > 99%ile.
        three_std_dev = dataframe_merged['normalized'].quantile(0.99)
        dataframe_merged = dataframe_merged[dataframe_merged.normalized <
                                            three_std_dev]

    dataframe_merged['cluster_ordered'] = pandas.to_numeric(
        dataframe_merged['cluster_ordered'], errors='coerce')
    dataframe_merged['cluster_ordered'] = dataframe_merged[
        'cluster_ordered'].astype('category')
    return dataframe_merged.sort_values(
        by='cluster_ordered', ascending=True).to_dict('records')


@cache.memoize(timeout=3600)
def get_ortholog_cluster_order():
    """Order cluster mm_hs_homologous_cluster.txt.

    Arguments:
        None

    Returns:
        list: tuples of (species, cluster_number)
    """
    try:
        df = pandas.read_csv(
            '{}/mm_hs_homologous_cluster.txt'.format(
                current_app.config['DATA_DIR']),
            sep='\t')
    except FileNotFoundError:
        return []
    clusters = list()
    for _, row in df.iterrows():
        mmu_cluster = ('mmu', int(row['Mouse Cluster']))
        hsa_cluster = ('hsa', int(row['Human Cluster']))
        if mmu_cluster not in clusters:
            clusters.append(mmu_cluster)
        if hsa_cluster not in clusters:
            clusters.append(hsa_cluster)

    return clusters


# Plot generating
@cache.memoize(timeout=3600)
def get_cluster_plot(species, grouping="cluster"):
    """Generate tSNE cluster plot.

    Arguments:
        species (str): Name of species.
        grouping (str): Which variable to use for grouping. cluster_name, biosample, layer or cluster_biosample

    Returns:
        str: HTML generated by Plot.ly.
    """
    points = get_cluster_points(species)
    if not points:
        raise FailToGraphException

    traces = OrderedDict()
    max_cluster = int(
        max(points, key=lambda x: int(x['cluster_ordered']))['cluster_ordered'])+1
    if species=='mmu':
        max_cluster=16
    colors = generate_cluster_colors(max_cluster)
    symbols=['circle-open','square-open','cross','triangle-up','triangle-down','octagon','star','diamond']
    for point in points:
        cluster_num=int(point['cluster_ordered'])
        biosample=int(point.get('biosample',1))-1
        cluster_sample_num=int(point['cluster_ordered'])+max_cluster*biosample
        trace = traces.setdefault(cluster_sample_num,
          Scattergl(
              x=list(),
              y=list(),
              text=list(),
              mode='markers',
              visible=True,
              name=point['cluster_name']+" Sample"+point['biosample'],
              # EAM: TODO - create a toggle switch to allow the user to switch legend grouping
              # legendgroup=str(biosample),
              legendgroup=point[grouping],
              marker={
                    'color': colors[cluster_num-1],
                    'size': 7,
                    'symbol': symbols[biosample], # Eran and Fangming 09/12/2017
                    'line' : {'width' : 1, 'color':colors[cluster_num-1]}
                    },
              hoverinfo='text'))
        trace['x'].append(point['tsne_x'])
        trace['y'].append(point['tsne_y'])
        trace['text'].append(
            build_hover_text({
                'Cell': point.get('samp', 'N/A'),
                'Layer': point.get('layer', 'N/A'),
                'Biosample': point.get('biosample', 'N/A'),
                'Cluster': str(cluster_num)
                }))

    if species == 'mmu':
        for i in range(17,23,1):
            traces[i]['marker']['size']=15
            traces[i]['marker']['symbol']=symbols[i % len(symbols)]
            traces[i]['marker']['color']='black'
            traces[i]['visible']="legendonly"

    layout = Layout(
        autosize=False,
        showlegend=True,
        width=900,
        height=700,
        margin={'l': 100,
                'r': 150,
                'b': 75,
                't': 75,
                'pad': 20
                },
        legend={
            'orientation': 'v',
            'traceorder': 'grouped',
            'tracegroupgap': 10,
            'x': 1.03,
            'font': {
                'color': 'rgba(1,2,2,1)',
                'size': 12
            },
        },
        xaxis={
            'title': 'tSNE 1',
            'titlefont': {
                'color': 'rgba(1,2,2,1)',
                'size': 16
            },
            'type': 'linear',
            'ticks': '',
            'showticklabels': False,
            'tickwidth': 0,
            'showline': True,
            'showgrid': False,
            'zeroline': False,
            'linecolor': 'black',
            'linewidth': 0.5,
            'mirror': True
        },
        yaxis={
            'title': 'tSNE 2',
            'titlefont': {
                'color': 'rgba(1,2,2,1)',
                'size': 16
            },
            'type': 'linear',
            'ticks': '',
            'showticklabels': False,
            'tickwidth': 0,
            'showline': True,
            'showgrid': False,
            'zeroline': False,
            'linecolor': 'black',
            'linewidth': 0.5,
            'mirror': True,
            # 'range': [-20,20]
        },
        title='Cell clusters',
        titlefont={'color': 'rgba(1,2,2,1)',
                   'size': 20},
        annotations=[{
            'text': 'Cluster',
            'x': 0,
            'y': -0.2,
            'ax': 0,
            'ay': 0,
            'showarrow': False,
            'font': {
                'color': 'rgba(1,2,2,1)',
                'size': 16
            },
            'xref': 'paper',
            'yref': 'paper',
            'xanchor': 'left',
            'yanchor': 'bottom',
            'textangle': 0,
        }]
    )

    return plotly.offline.plot(
        {
            'data': list(traces.values()),
            'layout': layout
        },
        output_type='div',
        show_link=False,
        include_plotlyjs=False)


@cache.memoize(timeout=3600)
def get_mch_scatter(species, gene, level, ptile_start, ptile_end):
    """Generate gene body mCH scatter plot.

    x- and y-locations are based on tSNE cluster data.

    Arguments:
        species (str): Name of species.
        gene (str):  Name of gene for that species.
        level (str): Type of mCH data. Should be "original" or "normalized".
        ptile_start (float): Lower end of color percentile. [0, 1].
        ptile_end (float): Upper end of color percentile. [0, 1].

    Returns:
        str: HTML generated by Plot.ly.
    """
    points = get_gene_mch(species, gene, True)
    if not points:
        raise FailToGraphException

    x, y, text, mch = list(), list(), list(), list()
    for point in points:
        x.append(point['tsne_x'])
        y.append(point['tsne_y'])
        if level == 'normalized':
            mch_value = point['normalized']
        else:
            mch_value = point['original']
        mch.append(mch_value)
        text.append(
            build_hover_text({
                'mCH': round(mch_value, 6),
                'Sample': point['samp'],
                'Cluster': point['cluster_name']
            }))

    # Sets mCH levels below or above the percentiles to %tile limits.
    mch_dataframe = pandas.DataFrame(mch)
    start = mch_dataframe.dropna().quantile(ptile_start).values[0].tolist()
    end = mch_dataframe.dropna().quantile(ptile_end).values[0].tolist()
    mch_colors = [set_color_by_percentile(x, start, end) for x in mch]

    colorbar_tickval = list(arange(start, end, (end - start) / 4))
    colorbar_tickval[0] = start
    colorbar_tickval.append(end)
    colorbar_ticktext = [
        str(round(x, 3)) for x in arange(start, end, (end - start) / 4)
    ]
    colorbar_ticktext[0] = '<' + str(round(start, 3))
    colorbar_ticktext.append('>' + str(round(end, 3)))

    geneName = gene_id_to_name(species, gene)
    geneName = geneName['geneName']

    trace = Scatter(
        mode='markers',
        x=x,
        y=y,
        text=text,
        marker={
            'color': mch_colors,
            'colorscale': 'Viridis',
            'size': 4,
            'colorbar': {
                'x':1.05,
                'len': 0.5,
                'title': level.capitalize() + ' mCH',
                'titleside': 'right',
                'tickmode': 'array',
                'tickvals': colorbar_tickval,
                'ticktext': colorbar_ticktext
            }
        },
        hoverinfo='text',)
    layout = Layout(
        autosize=False,
        width=850,
        height=700,
        title='Gene body mCH: '+geneName,
        titlefont={'color': 'rgba(1,2,2,1)',
                   'size': 20},
        margin={'l': 49,
                'r': 0,
                'b': 30,
                't': 75,
                'pad': 0},
        xaxis={
            'title': 'tSNE 1',
            'titlefont': {
                'color': 'rgba(1,2,2,1)',
                'size': 16
            },
            'type': 'linear',
            'ticks': '',
            'tickwidth': 0,
            'showticklabels': False,
            'showline': True,
            'showgrid': False,
            'zeroline': False,
            'linecolor': 'black',
            'linewidth': 0.5,
            'mirror': True,
        },
        yaxis={
            'title': 'tSNE 2',
            'titlefont': {
                'color': 'rgba(1,2,2,1)',
                'size': 16
            },
            'type': 'linear',
            'ticks': '',
            'tickwidth': 0,
            'showticklabels': False,
            'showline': True,
            'showgrid': False,
            'zeroline': False,
            'linecolor': 'black',
            'linewidth': 0.5,
            'mirror': True,
            # 'range': [-20,20]
        },
        hovermode='closest',)

    return plotly.offline.plot(
        {
            'data': [trace],
            'layout': layout
        },
        output_type='div',
        show_link=False,
        include_plotlyjs=False)


@cache.memoize(timeout=3600)
def get_mch_box(species, gene, level, outliers):
    """Generate gene body mCH box plot.

    Traces are grouped by cluster.

    Arguments:
        species (str): Name of species.
        gene (str):  Name of gene for that species.
        level (str): Type of mCH data. Should be "original" or "normalized".
        outliers (bool): Whether if outliers should be displayed.

    Returns:
        str: HTML generated by Plot.ly.
    """
    points = get_gene_mch(species, gene, outliers)
    if not points:
        raise FailToGraphException

    traces = OrderedDict()
    max_cluster = int(
        max(points, key=lambda x: int(x['cluster_ordered']))['cluster_ordered']) + 1
    if species=='mmu':
        max_cluster=16
    colors = generate_cluster_colors(max_cluster)
    for point in points:
        trace = traces.setdefault(int(point['cluster_ordered']),
            Box(y=list(),
                name=point['cluster_name'],
                marker={
                    'color': colors[(int(point['cluster_ordered'])-1)%len(colors)],
                    'outliercolor': colors[(int(point['cluster_ordered'])-1)%len(colors)],
                    'size': 6
                },
                boxpoints='suspectedoutliers',
                visible=True,
                hoverinfo='text'))
        if level == 'normalized':
            trace['y'].append(point['normalized'])
        else:
            trace['y'].append(point['original'])

    if species == 'mmu':
        for i in range(17,23,1):
            traces[i]['marker']['color']='black'
            traces[i]['marker']['outliercolor']='black'
            traces[i]['visible']="legendonly"

    geneName = gene_id_to_name(species, gene)
    geneName = geneName['geneName']

    layout = Layout(
        autosize=False,
        width=950, height=700,
        title='Gene body mCH in each cluster: '+geneName,
        titlefont={'color': 'rgba(1,2,2,1)',
                   'size': 20},
        legend={
            'orientation': 'h',
            'y': -0.3,
            'traceorder': 'normal',
        },
        xaxis={
            'title': 'Cluster',
            'titlefont': {
                'size': 17
            },
            'type': 'category',
            'anchor': 'y',
            'ticks': 'outside',
            'ticklen': 4,
            'tickangle': -45,
            'tickwidth': 0.5,
            'showticklabels': True,
            'tickfont': {
                'size': 12
            },
            'showline': True,
            'zeroline': False,
            'showgrid': True,
            'linewidth': 1,
            'mirror': True,
        },
        yaxis={
            'title': geneName+' '+level.capitalize() + ' mCH',
            'titlefont': {
                'size': 15
            },
            'type': 'linear',
            'anchor': 'x',
            'ticks': 'outside',
            # 'tickcolor': 'white',
            'ticklen': 4,
            'tickwidth': 0.5,
            'showticklabels': True,
            'tickfont': {
                'size': 12
            },
            'showline': True,
            'zeroline': False,
            'showgrid': True,
            'linewidth': 1,
            'mirror': True,
        },
        )

    return plotly.offline.plot(
        {
            'data': list(traces.values()),
            'layout': layout
        },
        output_type='div',
        show_link=False,
        include_plotlyjs=False)


@cache.memoize(timeout=3600)
def get_mch_box_two_species(gene_mmu, gene_hsa, level, outliers):
    """Generate gene body mCH box plot for two species.

    Traces are grouped by cluster and ordered by mm_hs_homologous_cluster.txt.
    Mouse clusters red, human clusters black.

    Arguments:
        gene_mmu (str):  Name of gene for that species for mouse.
        gene_hsa (str):  Name of gene for that species for human.
        level (str): Type of mCH data. Should be "original" or "normalized".
        outliers (bool): Whether if outliers should be displayed.

    Returns:
        str: HTML generated by Plot.ly.
    """
    points_mmu = get_gene_mch('mmu', gene_mmu, outliers)
    points_hsa = get_gene_mch('hsa', gene_hsa, outliers)
    cluster_order = get_ortholog_cluster_order()
    if not points_mmu or not points_hsa or not cluster_order:
        raise FailToGraphException

    geneName = gene_id_to_name('mmu', gene_mmu)
    geneName=geneName['geneName']

    # EAM - This organizes the box plot into groups
    traces_mmu = Box(
        y=list(i.get(level) for i in points_mmu if i.get('cluster_ortholog')),
        x=list(i.get('cluster_ortholog') for i in points_mmu if i.get('cluster_ortholog')),
        marker={'color':'red', 'outliercolor':'red'},
        boxpoints='suspectedoutliers',
        hoverinfo='text')
    traces_hsa = Box(
        y=list(i.get(level) for i in points_hsa if i.get('cluster_ortholog')),
        x=list(i.get('cluster_ortholog') for i in points_hsa if i.get('cluster_ortholog')),
        marker={'color':'black', 'outliercolor':'black'},
        boxpoints='suspectedoutliers',
        hoverinfo='text')
    traces_combined = [traces_mmu, traces_hsa]

    layout = Layout(
        boxmode='group',
        autosize=False,
        showlegend=False,
        width=900,
        height=700,
        title='Gene body mCH in each cluster: '+geneName,
        titlefont={'color': 'rgba(1,2,2,1)',
                   'size': 20},
        # legend={
        #     'orientation': 'h',
        #     'x': -0.1,
        #     'y': -0.6,
        #     'traceorder': 'normal',
        # },
        xaxis={
            'title': '',
            'titlefont': {
                'size': 14
            },
            'type': 'category',
            'anchor': 'y',
            'ticks': 'outside',
            'tickcolor': 'rgba(51,51,51,1)',
            'ticklen': 4,
            'tickwidth': 0.5,
            'tickangle': -35,
            'showticklabels': True,
            'tickfont': {
                'size': 12
            },
            'showline': False,
            'zeroline': False,
            'showgrid': True,
        },
        yaxis={
            'title': geneName+' '+level.capitalize() + ' mCH',
            'titlefont': {
                'size': 15
            },
            'type': 'linear',
            'anchor': 'x',
            'ticks': 'outside',
            'tickcolor': 'rgba(51,51,51,1)',
            'ticklen': 4,
            'tickwidth': 0.5,
            'showticklabels': True,
            'tickfont': {
                'size': 12
            },
            'showline': False,
            'zeroline': False,
            'showgrid': True,
        },
        shapes=[
            {
                'type': 'rect',
                'fillcolor': 'transparent',
                'line': {
                    'color': 'rgba(115, 115, 115, 1)',
                    'width': 1,
                    'dash': False
                },
                'yref': 'paper',
                'xref': 'paper',
                'x0': 0,
                'x1': 1,
                'y0': 0,
                'y1': 1
            },
        ],
        annotations=[{
            'text': '<b>■</b> Mouse',
            'x': 0.4,
            'y': 1.02,
            'ax': 0,
            'ay': 0,
            'showarrow': False,
            'font': {
                'color': 'red',
                'size': 12
            },
            'xref': 'paper',
            'yref': 'paper',
            'xanchor': 'left',
            'yanchor': 'bottom',
            'textangle': 0,
        }, {
            'text': '<b>■</b> Human',
            'x': 0.5,
            'y': 1.02,
            'ax': 0,
            'ay': 0,
            'showarrow': False,
            'font': {
                'color': 'Black',
                'size': 12
            },
            'xref': 'paper',
            'yref': 'paper',
            'xanchor': 'left',
            'yanchor': 'bottom',
            'textangle': 0,
        }])

    return plotly.offline.plot(
        {
            'data': traces_combined,
            'layout': layout
        },
        output_type='div',
        show_link=False,
        include_plotlyjs=False)
