import collections
import copy
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from import_runtime import Importer, ref_for
from runtime_variants import ENERGY_CELL, normalize_material_variants, packed


class RuntimeVariantsTest(unittest.TestCase):
    def test_charge_states_share_materials_without_erasing_other_nbt(self):
        def item(ref,tag,cls=ENERGY_CELL):
            return dict(ref=ref,baseRef=ref.split('@')[0],name='Cell',itemClass=cls,nbt=packed(tag))
        charge=lambda amount:{'Energy':{'type':'NBTTagInt','value':{'field_74748_a':amount}}}
        data={'items':[item('item:917:4@empty',charge(0)),item('item:917:4@full',charge(50_000_000)),
                       item('item:917:4@enchanted',{**charge(0),'ench':['fortune']}),
                       item('item:500:0@a',{'material':'copper'},'microblock'),
                       item('item:500:0@b',{'material':'tin'},'microblock'),
                       item('item:501:0@a',charge(5),'unreviewed.mod.Item')],
              'recipes':[{'id':'craft','processId':'craft','source':'craft','calculable':True,
                          'output':{'ref':'item:917:4@empty','count':1,'nbt':packed(charge(0))},
                          'inputs':[{'ref':'item:917:4@full','count':1}]}],
              'ores':{'ore:cell':[{'ref':'item:917:4@full','count':1}]},'summary':{}}
        result=normalize_material_variants(data)
        self.assertEqual(result['aliases']['item:917:4@full'],'item:917:4')
        self.assertEqual(result['recipes'][0]['output'],{'ref':'item:917:4','count':1})
        self.assertEqual(result['ores']['ore:cell'][0]['ref'],'item:917:4')
        refs={i['ref'] for i in result['items']}
        self.assertIn('item:500:0@a',refs);self.assertIn('item:500:0@b',refs)
        self.assertIn('item:501:0@a',refs)
        self.assertNotEqual(result['aliases']['item:917:4@enchanted'],'item:917:4')
        before=copy.deepcopy(result)
        self.assertEqual(normalize_material_variants(result),before)

    def test_only_reviewed_upgrade_class_is_enabled_and_preserves_slot_identity(self):
        importer=Importer.__new__(Importer)
        importer.items={'item:1:0':{'numericId':1,'metadata':'0','ref':'item:1:0'},
                        'item:2:0':{'numericId':2,'metadata':'0','ref':'item:2:0'}}
        importer.ores={};importer.recipes={};importer.counts=collections.Counter();importer.containers={}
        part={'kind':'item','id':1,'meta':0,'count':1,'nbt':{'class':'NBTTagCompound','fields':{
            'field_74784_a':{'entries':[{'key':'Energy','value':{'class':'NBTTagInt','fields':{'field_74748_a':0}}}]}}}}
        recipe={'class':'cofh.util.UpgradeRecipe','recipeOutput':{'kind':'item','id':2,'meta':0,'count':1},
                'fields':{'input':[None,'ingotEnderium',None,'ingotEnderium',part,'ingotEnderium',None,'ingotEnderium',None],
                          'width':3,'upgradeSlot':4}}
        importer.crafting(recipe)
        converted=list(importer.recipes.values())[0]
        self.assertTrue(converted['calculable'])
        self.assertEqual(converted['grid'][1][1]['ref'],ref_for(part))
        self.assertEqual(sum(s['count'] for s in converted['inputs'] if s['ref']=='ore:ingotEnderium'),4)
        recipe['class']='unreviewed.mod.UpgradeRecipe'
        importer.crafting(recipe)
        self.assertFalse(list(importer.recipes.values())[-1]['calculable'])


if __name__=='__main__':unittest.main()
